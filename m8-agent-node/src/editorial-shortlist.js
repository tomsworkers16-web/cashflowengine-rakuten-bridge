// Evidence-limited shortlist of Rakuten ranking candidates for a reader-first media.
// Ranking is discovery evidence, not proof of product quality, long-term demand or sales.
const THEMES=[
 ['cleaning',/換気扇|フィルター|掃除|汚れ|ブラシ|洗浄|排気口|カバー/],
 ['storage',/収納|ラック|整理|ホルダー|スタンド|置き場|水切り/],
 ['food_preservation',/保存|真空|鮮度|冷凍|密閉|タッパー|コンテナ/],
 ['floor_protection',/マット|床|撥水|防水/],
 ['tableware',/食器|プレート|カップ|ボウル|皿|グラス/],
 ['cooking',/調理|キッチン|包丁|鍋|フライパン|ピーラー/],
 ['safety',/防災|備蓄|非常|停電|防犯/],
 ['digital',/スマホ|充電|USB|ケーブル|デスク|パソコン/]
];
// Specific product identity wins over generic accessory terms like 水切り and マット.
// Otherwise the 2026-11-10 live probe misclassified a dish-drying tea towel as storage.
const SPECIFIC_THEMES=[
 ['kitchen_textiles',/ティータオル|キッチンタオル|キッチンクロス|ふきん|布巾|ディッシュクロス/],
 ['food_preservation',/真空保存|食品保存|フードストッカー|密閉容器|保存容器/],
 ['floor_protection',/キッチンマット|フロアマット|床保護|透明マット/]
];
const AD_NOISE=/クーポン|OFF|送料無料|限定価格|マラソン|ポイント|楽天総合\d+位|楽天年間ランキング|先着|売り切れ|半額|超お得/u;

export function classifyTheme(name){
 const n=String(name??'');
 for(const [theme,re] of SPECIFIC_THEMES)if(re.test(n))return theme;
 for(const [theme,re] of THEMES)if(re.test(n))return theme;
 return 'unclassified';
}
export function evaluateRankingCandidate(candidate){
 const name=String(candidate?.itemName??'');
 const price=Number(candidate?.price);
 const rank=Number(candidate?.rank);
 const code=String(candidate?.itemCode??'');
 if(!name.trim()||!code.includes(':')||!Number.isInteger(rank)||rank<1||!Number.isFinite(price)||price<=0)
  return null;
 if(candidate?.hasAffiliateUrl!==true)return null;
 const shop=code.split(':')[0];
 const theme=classifyTheme(name);
 const meaningful=theme!=='unclassified'&&theme!=='tableware';
 // This is a *research priority*, not a prediction of conversions.
 let priority=0;
 const rationale=[];
 if(rank<=10){priority+=15;rationale.push('ranking_top10');}
 else if(rank<=30){priority+=8;rationale.push('ranking_top30');}
 if(price>=1500&&price<=10000){priority+=12;rationale.push('price_band_1500_10000');}
 else if(price>10000&&price<=25000){priority+=5;rationale.push('price_band_10000_25000');}
 if(meaningful){priority+=25;rationale.push('plausible_everyday_use_case');}
 else if(theme==='tableware'){priority+=5;rationale.push('tableware_interest_only');}
 if(AD_NOISE.test(name)){priority-=5;rationale.push('promotional_title_requires_verification');}
 return {
  rank,shop,itemCode:code,itemName:name,price,genreId:candidate.genreId??null,
  theme,priority,editorialAngle:meaningful?'小さな不便を解決する用途・寸法・注意点を検証':'話題性と購入前の確認点を検証',
  evidenceLevel:'ranking_and_title_only',
  requiresVerification:['product_specifications','review_context','current_price','affiliate_disclosure','rights_to_media'],
  rationale
 };
}
export function buildEditorialShortlist(ranking,{max=5,maxPerShop=1,maxPerTheme=2}={}){
 if(!Array.isArray(ranking))throw new Error('ranking_items_required');
 if(!Number.isInteger(max)||max<1||max>10)throw new Error('invalid_shortlist_limit');
 const all=ranking.map(evaluateRankingCandidate).filter(Boolean)
  .sort((a,b)=>b.priority-a.priority||a.rank-b.rank);
 const shops=new Map(),themes=new Map(),selected=[];
 for(const item of all){
  if(selected.length>=max)break;
  if((shops.get(item.shop)||0)>=maxPerShop)continue;
  if((themes.get(item.theme)||0)>=maxPerTheme)continue;
  selected.push(item);
  shops.set(item.shop,(shops.get(item.shop)||0)+1);
  themes.set(item.theme,(themes.get(item.theme)||0)+1);
 }
 return {selected,scanned:ranking.length,eligible:all.length,
  disclaimer:'Candidate research only; ranking and title alone do not verify performance, niche demand, historic sales or affiliate conversion'};
}
