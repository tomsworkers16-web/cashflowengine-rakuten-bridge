// Research-grounded article drafting. No LLM, browsing, publishing, or invented product specs.
// All product facts are copied from explicitly sourced research, never generated from listing titles.
import { classifyTheme } from './editorial-shortlist.js';

const GUIDE = {
  storage: {
    problem: '設置できても使いにくい収納用品を選びたくない',
    context: '置き場所が限られ、出し入れと掃除を両立したい家庭',
    checks: [
      ['寸法が合っても周囲の動線を塞ぐ', '設置場所の縦・横・奥行きと周辺の開閉・動作範囲を測る'],
      ['収納したい物が収まらない', '実際に入れる物の最大寸法と商品内寸を照合する'],
      ['掃除や取り外しが負担になる', '固定方法・取り外せる部品・洗浄方法を販売ページで確認する']
    ]
  },
  kitchen_textiles: {
    problem: '台所用の布製品を買っても乾きにくさや扱いづらさで困りたくない',
    context: '洗い物の後片付けを日常的に行う家庭',
    checks: [
      ['使う場所に対して大きすぎる', '広げた寸法と置き場所・干し場所を照合する'],
      ['洗い替えや乾燥の手間が増える', '洗濯方法・乾燥条件・枚数を確認する'],
      ['用途に合わない素材を選ぶ', '素材表示と対応するお手入れ方法を確認する']
    ]
  },
  cleaning: {
    problem: '掃除用具を買っても作業が増えるだけになるのを避けたい',
    context: '短い時間で掃除と片付けを済ませたい家庭',
    checks: [
      ['掃除対象の形状に合わない', '使用対象・形状・寸法を商品説明で照合する'],
      ['道具自体の掃除に時間がかかる', '部品の洗浄・乾燥方法を確認する'],
      ['保管に困る', '使用後の収納寸法と保管場所を照合する']
    ]
  },
  food_preservation: {
    problem: '食品保存用品を買ったのに普段の容器や置き場所に合わないのを避けたい',
    context: '冷蔵庫や棚の容量に制約がある家庭',
    checks: [
      ['保存場所に収まらない', '外寸を冷蔵庫・棚の有効寸法と照合する'],
      ['用途に合わない素材・温度条件', '製品表示の素材・使用温度・対応用途を確認する'],
      ['パッキンや部品の手入れが難しい', '分解方法・洗い方・交換部品の案内を確認する']
    ]
  },
  digital: {
    problem: 'アクセサリーを買ったのに手持ちの機器で使えないのを避けたい',
    context: '複数の端末やケーブルを使う家庭',
    checks: [
      ['接続規格が合わない', '端子・規格・対応機種を公式情報で照合する'],
      ['電源条件が足りない', '必要な給電方式と手持ちの電源環境を確認する'],
      ['配線が動線を妨げる', 'ケーブル長と置き場所を測り実際の取り回しを確認する']
    ]
  },
  generic: {
    problem: '便利そうな商品を買っても自分の暮らしに合わないのを避けたい',
    context: '購入前に設置条件と維持の負担を確認したい家庭',
    checks: [
      ['置き場所に収まらない', '外寸と使う場所の有効寸法を測る'],
      ['日常の使い方に合わない', '使う頻度と製品の使用条件を比較する'],
      ['手入れの負担を見落とす', '洗浄・点検・消耗品の有無を販売元の説明で確認する']
    ]
  }
};
GUIDE.floor_protection = GUIDE.generic;
GUIDE.tableware = GUIDE.generic;
GUIDE.cooking = GUIDE.generic;
GUIDE.safety = GUIDE.generic;

const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(s+'T00:00:00Z'));
const https = s => typeof s === 'string' && /^https:\/\/[^\s]+$/i.test(s);
const clean = s => typeof s === 'string' ? s.trim() : '';

// Promote already sourced variant facts into actionable buying guidance; do not
// infer dimensions, load limits or suitability from the product title alone.
function supportedStorageGuidance(facts) {
  const byId=new Map(facts.map(f=>[f.id,f.claim]));
  const slimInner=byId.get('slim_drawer_inner_dimensions');
  const wideInner=byId.get('wide_drawer_inner_dimensions');
  const slimLoad=byId.get('slim_load_capacity');
  const wideLoad=byId.get('wide_load_capacity');
  if (!slimInner || !wideInner || !slimLoad || !wideLoad) return null;
  // Require structured, matching claims for *both* variants before putting
  // figures into reader-facing advice. Do not make up missing numbers.
  const innerRe=/引出し内寸は幅(\d+(?:\.\d+)?)×奥行(\d+(?:\.\d+)?)×深さ(\d+(?:\.\d+)?)cmと記載$/u;
  const loadRe=/耐荷重は天板約(\d+(?:\.\d+)?)kg、引出し1段あたり約(\d+(?:\.\d+)?)kgと記載$/u;
  const si=slimInner.match(innerRe),wi=wideInner.match(innerRe);
  const sl=slimLoad.match(loadRe),wl=wideLoad.match(loadRe);
  if(!si||!wi||!sl||!wl)return null;
  const assembly=byId.get('assembly_duration');
  const material=byId.get('material');
  const dims=(m)=>'幅'+m[1]+'×奥行'+m[2]+'×深さ'+m[3]+'cm';
  return {
    title:'収納チェスト選びで見落としたくない3つのこと｜内寸・耐荷重・組み立て',
    checks:[
      {risk:'設置できても、引き出しを開けるスペースが足りない',
       howToCheck:'置く場所の外寸だけでなく、引き出しを手前に出す空間と通路幅を測る。外寸が収まっても使えるとは限らない。'},
      {risk:'スリムとワイドで収納できる物のサイズが違う',
       howToCheck:'販売ページの引き出し内寸は、スリムが'+dims(si)+'、ワイドが'+dims(wi)+'。収納したい衣類やケースを実際に測り、幅・奥行・深さをそれぞれ比べる。'},
      {risk:'重さや組み立ての条件を見落とす',
       howToCheck:'販売ページに記載された引き出し1段あたりの耐荷重は、スリム約'+sl[2]+'kg、ワイド約'+wl[2]+'kg。収納物の重さを確かめる。'+(assembly==='組立時間は約20-30分と記載'?'組み立ての目安は約20〜30分。作業場所と時間も確保しておく。':'組み立て条件も販売ページで確認する。')}
    ],
    comparisonMethod:'①設置場所と引き出し前方の空間を採寸 → ②収納物の寸法をスリム・ワイドそれぞれの内寸と比較 → ③1段あたりの重量を耐荷重と照合する。'+(material==='材質はポリプロピレンと記載'?'材質はポリプロピレンと案内されている。':''),
    goodFor:'サイズを測ったうえで、引き出しの内寸と耐荷重が収納予定の物に合う人',
    notGoodFor:'引き出し前方の空間を確保できない人や、収納物が記載の内寸・耐荷重を超える人'
  };
}

/**
 * research = { itemCode, productPageUrl, checkedAt, facts:[{id,claim,sourceUrl,checkedAt}],
 *              affiliateUrl, rights: {noMedia:true}, subjectContext?:string }
 * Product evidence is not considered verified when its provenance is missing.
 */
export function draftFromResearch(candidate, research) {
  if (!candidate?.itemCode || !research || research.itemCode !== candidate.itemCode)
    return {status:'research_required', reason:'item_identity_unverified'};
  const facts = Array.isArray(research.facts) ? research.facts.filter(f =>
    clean(f?.id) && clean(f?.claim) && https(f?.sourceUrl) && validDate(f?.checkedAt)
  ) : [];
  if (!facts.length) return {status:'research_required', reason:'sourced_product_facts_missing'};
  if (!https(research.affiliateUrl)) return {status:'research_required',reason:'affiliate_url_missing'};
  if (research.rights?.noMedia !== true) return {status:'research_required',reason:'no_media_declaration_required'};
  const theme = classifyTheme(candidate.itemName);
  const playbook = GUIDE[theme] || GUIDE.generic;
  const productName = clean(candidate.itemName);
  const specific = theme==='storage' ? supportedStorageGuidance(facts) : null;
  const draft = {
    itemCode:candidate.itemCode,
    title:specific?.title || '購入前に確認したい3つのこと｜'+(productName.length>42?productName.slice(0,41)+'…':productName),
    reader:{problem:playbook.problem,context:clean(research.subjectContext)||playbook.context},
    purchaseChecks:specific?.checks || playbook.checks.map(([risk,howToCheck])=>({risk,howToCheck})),
    comparisonMethod:specific?.comparisonMethod || '使う場所・製品仕様・手入れ方法を同じ表に並べ、合わない条件があれば購入を見送る',
    goodFor:specific?.goodFor || '各確認項目を商品ページと使用環境で照合でき、条件に合うと判断できた人',
    notGoodFor:specific?.notGoodFor || 'サイズ・対応条件・手入れ方法のいずれかが確認できない、または合わない人',
    verifiedFacts:facts.map(f=>({id:f.id,claim:f.claim,sourceUrl:f.sourceUrl,checkedAt:f.checkedAt})),
    productClaims:facts.map(f=>({text:f.claim,factId:f.id})),
    isAffiliate:true,disclosure:'【PR】',affiliateUrl:research.affiliateUrl,
    fabricatedExperience:false,unverifiedPerformance:false,mediaRightsVerified:true
  };
  return {status:'drafted',draft,sourceStatus:'provided_research_not_independently_verified'};
}
