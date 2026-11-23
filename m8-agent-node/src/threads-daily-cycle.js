// Daily reader-first editorial cycle. Planning and approval decisions only.
// No API requests, post submissions, data persistence, credential access or scheduling.
import { createHash } from 'node:crypto';
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { draftFromResearch } from './editorial-research-drafter.js';
import { evaluateEditorialDraft } from './editorial-quality-gate.js';
import { cleanProductName, validatePublicationText } from './product-posting.js';
import { scoreCandidate, buildReply, looksCorruptedJapanese } from './external-reply-engine.js';
import { apiSource } from './editorial-rakuten-evidence.js';
export const DAILY_SLOTS=Object.freeze(['07:30','12:30','19:30']);
const roles=['column','comparison','revenue'];
const THEMES={
 storage:{title:'収納を増やす前に',column:'収納が足りないと思ったら、まず出し入れの動きを見直したい。よく使う物を取り出すために、別の物を動かしていませんか？置き場所だけでなく、使う人が毎回無理なく戻せる位置かを確認すると、買い足すべき物も見えやすくなります。',checks:['設置面積に加えて開閉に必要な空間を測る。','入れたい物の最大寸法と内寸を比べる。','収納物の重さと耐荷重を照合する。'],words:/収納|片付|整理|棚|ラック|引き出し/u},
 cleaning:{title:'掃除道具を買う前に',column:'掃除をラクにしたくても、道具を出して、使って、洗って戻すまでの手間が増えるなら続きにくいもの。どの工程が面倒なのか先に書き出して、道具を増やすべきか、置き場所を変えるだけで済むか考えてみたいですね。',checks:['掃除対象の形状と道具のサイズを照合する。','洗い方・乾かし方と使う頻度を確認する。','消耗品の価格や交換方法、保管場所を調べる。'],words:/掃除|汚れ|ほこり|ホコリ|換気扇|片付/u},
 kitchen_textiles:{title:'台所の布製品を選ぶ前に',column:'洗い物の後片付けは、道具を使った後にどう乾かし、どこに戻すかまでが一連の作業です。台所の布製品も、置く面積と干す場所を確認してから選びたいもの。洗い替えの枚数まで考えると、日々の使い方に合うか判断しやすくなります。',checks:['広げた寸法と置き場所・干し場所を測る。','洗濯・乾燥条件を表示で確認する。','洗い替え枚数と収納場所を考える。'],words:/キッチン|洗い物|ふきん|布巾|タオル|水切り/u},
 food_preservation:{title:'保存容器の購入前チェック',column:'食品を保存する道具を増やす前に、冷蔵庫の棚に今何が入っているかを確認。容量の大きさだけで選ぶと、棚に収まらないこともあります。保存する量だけでなく、洗う部品と乾かした後の置き場所まで考えて選びたいですね。',checks:['冷蔵庫や棚の有効寸法と外寸を比べる。','保存する食品に合う使用条件を説明で確認する。','パッキン等の洗浄方法・交換部品を調べる。'],words:/保存|冷蔵庫|容器|作り置き/u},
 digital:{title:'スマホ周辺機器を買う前に',column:'充電や配線を便利にしたいときは、まず手持ちの機器とケーブルを確認。端子が合っていても、必要な給電条件や取り回しが違えば思ったように使えない場合があります。新しい道具は、今の不便がどこにあるか整理してから選びたいですね。',checks:['端子・対応機種を公式説明で照合する。','必要な電源条件と手持ち機器を比較する。','設置場所とケーブルの取り回しを測る。'],words:/スマホ|充電|ケーブル|配線|デスク/u},
 cooking:{title:'調理道具を選ぶ前に',column:'便利な調理道具も、準備と片付けが大変だと出番が減ってしまいます。普段の調理でどの工程に手間がかかるか思い返して、既存の道具で代用できないか確認してみたいですね。',checks:['普段の材料量と道具の容量・寸法を照合する。','洗い方・取り外せる部品を商品説明で確認する。','使う頻度と収納場所を考える。'],words:/調理|料理|キッチン|献立|洗い物/u}
};
const str=x=>typeof x==='string'?x.trim():'';
const dayValid=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const dayTime=x=>Date.parse(x+'T00:00:00Z');
const validPage=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='item.rakuten.co.jp'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[a-zA-Z0-9_-]+\/[^/]+\/$/.test(u.pathname);}catch{return false;}};
const validAffiliate=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='hb.afl.rakuten.co.jp'&&!u.port&&!u.username&&!u.password&&!u.hash&&/^\/(?:ichiba|hgc)\//.test(u.pathname);}catch{return false;}};
function sameTarget(link,page){try{const u=new URL(link);if(u.searchParams.getAll('pc').length!==1)return false;const target=new URL(u.searchParams.get('pc'));if(target.protocol!=='https:'||target.hostname!=='item.rakuten.co.jp'||target.port||target.username||target.password||target.search||target.hash)return false;return target.origin+target.pathname.replace(/\/$/,'')+'/'===page;}catch{return false;}}
const verifiedPost=r=>Boolean(r?.id)&&['posted','verified_posted'].includes(r?.meta?.publishStatus);
const sha=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
const keyOf=(date,itemCode)=>'cfe-daily-'+date+'-'+sha(itemCode).slice(0,12);
const planDigest=plan=>sha([plan.jstDate,plan.campaignId,plan.itemCode,plan.theme,plan.slots.map(x=>[x.slot,x.role,x.text,x.affiliateUrl??null]),(plan.replySuggestions??[]).map(x=>[x.url,x.author,x.replyDraft,x.sourceDigest])]);
function freshFact(f, page, date){return (f?.sourceUrl===page||(f?.sourceUrl===apiSource&&f?.sourceKind==='official_item_caption'&&str(f.evidenceQuote)&&f.claim==='楽天の商品説明：'+f.evidenceQuote+'と記載'))&&dayValid(f.checkedAt)&&dayTime(f.checkedAt)<=dayTime(date)&&dayTime(date)-dayTime(f.checkedAt)<=7*86400000&&str(f.claim)&&!/(?:https?:\/\/|【PR】)/i.test(f.claim);}
function recentItems(history,date){const cutoff=dayTime(date)-7*86400000;return new Set(history.filter(r=>dayValid(r?.jstDate)&&dayTime(r.jstDate)>=cutoff&&dayTime(r.jstDate)<=dayTime(date)).map(r=>r.meta?.itemCode).filter(Boolean));}

function compose(candidate, research, date){
 const guide=THEMES[candidate.theme];
 if(!guide)return {reason:'theme_guide_missing'};
 if(!research||research.itemCode!==candidate.itemCode||!validPage(research.productPageUrl)||!validAffiliate(research.affiliateUrl)||!sameTarget(research.affiliateUrl,research.productPageUrl))return {reason:'product_or_link_identity_unverified'};
 const facts=(Array.isArray(research.facts)?research.facts:[]).filter(f=>freshFact(f,research.productPageUrl,date));
 if(!facts.length)return {reason:'fresh_product_fact_missing'};
 const generated=draftFromResearch(candidate,{...research,facts});
 if(!generated.draft)return {reason:generated.reason||'draft_unavailable'};
 const gate=evaluateEditorialDraft(generated.draft);
 if(gate.status!=='review_candidate')return {reason:'editorial_quality_gate_failed'};
 const column=guide.title+'\n\n'+guide.column;
 // Use the actual evidence-backed editorial draft, including supported variant
 // comparisons, rather than discarding it in favour of a generic checklist.
 const checks=generated.draft.purchaseChecks.map((v,i)=>(i+1)+'．'+v.howToCheck);
 const detailed=guide.title+'：確認したい3つのこと\n\n'+checks.join('\n')+'\n\n'+(facts[0].sourceKind==='official_item_caption'?'商品説明の例：':'販売ページの例：')+str(facts[0].claim)+'。';
 const comparison=validatePublicationText(detailed)?guide.title+'：確認したい3つのこと\n\n'+checks.join('\n'):detailed;
 const name=cleanProductName(candidate.itemName,35),url=research.affiliateUrl;
 let revenue=null;
 const relevance=f=>/inner_dimensions|load_capacity|dimensions|capacity|compatibility|operating_condition/u.test(f.id)?2:/material|assembly/u.test(f.id)?1:0;
 const prFacts=[...facts].sort((a,b)=>relevance(b)-relevance(a));
 for(const fact of prFacts){
  for(const parts of [[name,str(fact.claim),'購入前に使う場所と条件を確認してください。'],[cleanProductName(candidate.itemName,20),str(fact.claim)]]){
   const candidateText='【PR】'+parts.join('\n')+'\n'+url;
   if(!validatePublicationText(candidateText,{revenue:true,affiliateUrl:url})){revenue=candidateText;break;}
  }
  if(revenue)break;
 }
 if(!revenue||[column,comparison].some(x=>validatePublicationText(x)||/https?:\/\/|【PR】/i.test(x)))return {reason:'safe_copy_cannot_fit'};
 return {slots:[column,comparison,revenue].map((text,i)=>({slot:DAILY_SLOTS[i],role:roles[i],text,affiliateUrl:i===2?url:null})),gateScore:gate.total};
}

// Only review suggestions, never dispatch. Reject unrelated/commercial posts, duplicates, and uncertain past attempts.
export function planDailyReplySuggestions({candidates=[],history=[],ownUsername='',theme,date,max=3}={}){
 if(!Array.isArray(candidates)||!Array.isArray(history)||!dayValid(date)||!Number.isInteger(max)||max<0||max>3)throw new TypeError('invalid_reply_inputs');
 const guide=THEMES[theme];if(!guide||!str(ownUsername))return [];
 const canonical=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)||!/^\/@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return null;return u.pathname.replace(/\/$/,'').toLowerCase();}catch{return null;}};
 const seen=new Set(history.map(x=>canonical(x?.url)).filter(Boolean));
 const attempts=history.filter(x=>x?.jstDate===date&&['pending','posted','unverified','uncertain','failed'].includes(x.status));
 const used=new Set(attempts.map(x=>canonical(x.url)).filter(Boolean));
 const authors=new Set(attempts.map(x=>str(x.author).replace(/^@/,'').toLowerCase()).filter(Boolean));
 const capacity=Math.max(0,max-used.size);const suggestions=[];
 for(const row of [...candidates].map(c=>({c,score:scoreCandidate(c,{ownUsername})})).sort((a,b)=>b.score.score-a.score.score)){
  if(suggestions.length>=capacity)break;
  const c=row.c,url=canonical(c?.url),author=str(c?.author).replace(/^@/,'').toLowerCase();
  if(!url||!author||!url.startsWith('/@'+author+'/post/')||seen.has(url)||authors.has(author)||!row.score.eligible||row.score.score<45||!guide.words.test(str(c.text))||looksCorruptedJapanese(c.text))continue;
  const text=buildReply(c);
  if(!text||looksCorruptedJapanese(text)||/https?:\/\/|【PR】/i.test(text)||validatePublicationText(text))continue;
  suggestions.push({url:c.url,author:c.author,replyDraft:text,sourceDigest:sha(c.text),score:row.score.score,status:'reply_review_required',publishApproved:false});seen.add(url);authors.add(author);
 }
 return suggestions;
}

export function planThreadsDailyCycle({jstDate,ranking, researchByItemCode={},performanceRecords,history=[],replyCandidates=[],replyHistory=[],ownUsername='',max=5}={}){
 if(!dayValid(jstDate)||!Array.isArray(history))throw new TypeError('invalid_daily_inputs');
 const used=recentItems(history,jstDate);
 const recentGuide=new Set(history.filter(r=>dayValid(r?.jstDate)&&dayTime(r.jstDate)<dayTime(jstDate)&&dayTime(jstDate)-dayTime(r.jstDate)<=2*86400000&&verifiedPost(r)).map(r=>r.text));
 const shortlist=buildEditorialShortlist(ranking.filter(x=>!used.has(x?.itemCode)),{max,performanceRecords});
 const held=[];
 for(const candidate of shortlist.selected){
  const attempt=compose(candidate,researchByItemCode[candidate.itemCode],jstDate);
  if(!attempt.slots){held.push({itemCode:candidate.itemCode,reason:attempt.reason});continue;}
  if(attempt.slots.slice(0,2).some(s=>recentGuide.has(s.text))){held.push({itemCode:candidate.itemCode,reason:'recent_editorial_copy'});continue;}
  const plan={version:'threads-daily-cycle-v1',mode:'review_only',jstDate,campaignId:keyOf(jstDate,candidate.itemCode),itemCode:candidate.itemCode,theme:candidate.theme,slots:attempt.slots,gateScore:attempt.gateScore,publishApproved:false,published:0,
   replySuggestions:planDailyReplySuggestions({candidates:replyCandidates,history:replyHistory,ownUsername,theme:candidate.theme,date:jstDate})};
  return {...plan,digest:planDigest(plan),status:'batch_review_required',held,performance:shortlist.performance??null};
 }
 return {version:'threads-daily-cycle-v1',mode:'review_only',jstDate,status:'research_required',slots:[],held,replySuggestions:[],performance:shortlist.performance??null,publishApproved:false,published:0};
}

// This gate is deliberately separate from the actual publisher. A matching owner
// approval record is required for the immutable text of the whole batch.
export function selectDailyStage({plan,approval,jstDate,slot,journal=[],officialPostCount}={}){
 const hold=reason=>({status:'hold',reason,published:0});
 if(!dayValid(jstDate)||!Array.isArray(journal)||!Number.isSafeInteger(officialPostCount)||officialPostCount<0)return hold('missing_runtime_evidence');
 if(!plan||plan.jstDate!==jstDate||plan.status!=='batch_review_required'||!Array.isArray(plan.slots)||plan.slots.length!==3||!str(plan.itemCode)||plan.campaignId!==keyOf(jstDate,plan.itemCode))return hold('missing_or_stale_plan');
 if(plan.slots.some((x,i)=>!x||x.slot!==DAILY_SLOTS[i]||x.role!==roles[i]||validatePublicationText(x.text,{revenue:i===2,affiliateUrl:x.affiliateUrl})||(i<2&&(/https?:\/\/|【PR】/i.test(x.text)||x.affiliateUrl))||(i===2&&!validAffiliate(x.affiliateUrl))))return hold('invalid_stage_payload');
 if(!Array.isArray(plan.replySuggestions)||plan.replySuggestions.length>3||plan.replySuggestions.some(x=>!x)||plan.digest!==planDigest(plan)||approval?.approvedByOwner!==true||approval?.digest!==plan.digest||approval?.campaignId!==plan.campaignId||approval?.jstDate!==jstDate)return hold('approval_missing_or_changed');
 const index=DAILY_SLOTS.indexOf(slot);if(index<0)return hold('slot_invalid');
 const today=journal.filter(x=>x?.jstDate===jstDate);
 if(officialPostCount>=3||new Set(today.map(x=>x.slot)).size>=3)return hold('daily_cap_reached');
 if(today.some(x=>x.slot===slot))return hold('slot_already_attempted');
 for(let i=0;i<index;i++){
  const previous=today.filter(x=>x.slot===DAILY_SLOTS[i]);
  const last=previous.at(-1);
  if(!verifiedPost(last)||last.meta?.campaignId!==plan.campaignId||last.meta?.dailyStage!==roles[i]||last.text!==plan.slots[i].text)return hold('previous_stage_not_verified');
 }
 const next=plan.slots[index];
 return {status:'eligible_for_existing_publisher',text:next.text,affiliateUrl:next.affiliateUrl,meta:{campaignId:plan.campaignId,dailyStage:next.role,itemCode:plan.itemCode,role:next.role==='revenue'?'revenue':'guide',affiliate:next.role==='revenue'},published:0};
}

// Only exact, separately selected reply drafts from the same approved batch.
// A current scan must still contain the identical source text and draft.
export function selectApprovedDailyReplies({plan,approval,jstDate,journal=[],candidates=[],replyHistory=[],ownUsername=''}={}){
 if(!plan||!Array.isArray(plan.slots)||!Array.isArray(plan.replySuggestions)||!Array.isArray(approval?.approvedReplyUrls)||!Array.isArray(candidates))return [];
 // Validate the whole approved payload without relying on a scheduled slot being free.
 const check=selectDailyStage({plan,approval,jstDate,slot:DAILY_SLOTS[0],journal:[],officialPostCount:0});
 if(check.status!=='eligible_for_existing_publisher')return [];
 const first=journal.filter(x=>x?.jstDate===jstDate&&x.slot===DAILY_SLOTS[0]).at(-1);
 if(!verifiedPost(first)||first.meta?.campaignId!==plan.campaignId||first.meta?.dailyStage!=='column'||first.text!==plan.slots[0].text)return [];
 const current=planDailyReplySuggestions({candidates,history:replyHistory,ownUsername,theme:plan.theme,date:jstDate});
 const allowed=new Set(approval.approvedReplyUrls);
 return current.filter(d=>allowed.has(d.url)&&plan.replySuggestions.some(p=>p.url===d.url&&p.author===d.author&&p.replyDraft===d.replyDraft&&p.sourceDigest===d.sourceDigest))
  .map(d=>candidates.find(c=>c.url===d.url&&c.author===d.author&&sha(c.text)===d.sourceDigest)).filter(Boolean);
}

export function summarizeDailyCycleOutcome({plan,jstDate,journal=[],insights=[]}={}){
 if(plan?.jstDate!==jstDate||!Array.isArray(plan.slots)||plan.slots.length!==3)return {status:'no_qualified_plan',confirmed:0};
 const stages=plan.slots.map(s=>{
  const attempts=journal.filter(r=>r.jstDate===jstDate&&r.slot===s.slot);
  const row=attempts.at(-1);
  const confirmed=verifiedPost(row)&&row.meta?.campaignId===plan.campaignId&&row.meta?.dailyStage===s.role&&row.text===s.text;
  const measured=confirmed?insights.find(p=>String(p.id)===String(row.id)):null;
  return {slot:s.slot,role:s.role,status:confirmed?'confirmed':attempts.length?'unverified':'not_attempted',postId:confirmed?row.id:null,views:Number.isFinite(measured?.metrics?.views)?measured.metrics.views:'unknown'};
 });
 const confirmed=stages.filter(s=>s.status==='confirmed').length;
 return {status:confirmed===3?'sequence_confirmed':'sequence_incomplete',campaignId:plan.campaignId,confirmed,stages,affiliateAttribution:'unknown'};
}
