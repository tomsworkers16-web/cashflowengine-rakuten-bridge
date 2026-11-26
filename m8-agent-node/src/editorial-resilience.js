// Local, bounded research bookkeeping. No publication or external messaging.
import fs from 'node:fs';
import path from 'node:path';
import {evaluateRankingCandidate} from './editorial-shortlist.js';
import {selectDailyStage,DAILY_AUTO_POLICY} from './threads-daily-cycle.js';
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const dateMs=d=>Date.parse(d+'T00:00:00Z');
const stockName='editorial-product-stock.json';
export function readLocalEditorialJson(dir,name){try{const p=path.join(dir,name);if(fs.statSync(p).size>256*1024)return null;return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}
export function writeLocalEditorialJson(dir,name,value){const p=path.join(dir,name),tmp=p+'.tmp-'+process.pid;try{fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8',flag:'wx'});fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
export function eligibleStock(records,day){
 if(!validDay(day)||!Array.isArray(records))return [];
 return records.filter(r=>validDay(r?.checkedAt)&&dateMs(day)>=dateMs(r.checkedAt)&&dateMs(day)-dateMs(r.checkedAt)<=7*86400000&&evaluateRankingCandidate(r.candidate)).slice(0,12);
}
export function readProductStock(dir,day){return eligibleStock(readLocalEditorialJson(dir,stockName)?.records,day);}
// Stock is a research lead, not a publication authorization or reusable fact.
export function addProductStock(dir,plan,day){
 if(plan?.status!=='batch_review_required'||!evaluateRankingCandidate(plan.stockCandidate)||plan.stockCandidate.itemCode!==plan.itemCode||plan.stockCandidate.itemName!==plan.policyEvidence?.candidate?.itemName)return false;
 if(selectDailyStage({plan,jstDate:day,slot:'07:30',officialPostCount:0,autoPolicy:DAILY_AUTO_POLICY,accountUsername:'rakumitsu_select'}).status!=='eligible_for_existing_publisher')return false;
 const entry={checkedAt:day,candidate:plan.stockCandidate};
 const records=[entry,...readProductStock(dir,day).filter(r=>r.candidate.itemCode!==entry.candidate.itemCode)].slice(0,12);
 writeLocalEditorialJson(dir,stockName,{version:1,records});return true;
}
export function researchPhase(minutes){if(minutes>=17*60+30&&minutes<18*60)return 'evening';if(minutes>=23*60+15&&minutes<23*60+45)return 'stock';return null;}
export function reserveResearch(dir,day,phase){
 if(!validDay(day)||!['evening','stock'].includes(phase))return false;
 try{fs.writeFileSync(path.join(dir,`editorial-research-${day}-${phase}.json`),JSON.stringify({jstDate:day,phase,at:new Date().toISOString(),status:'reserved'}),{flag:'wx',encoding:'utf8'});return true;}catch{return false;}
}
export function summarizeEditorialAlert({jstDate,minutes,plan,journal=[],slotWindow=20,lastDecision,eveningResult}={}){
 const latest=new Map(journal.filter(r=>r.jstDate===jstDate).map(r=>[r.slot,r]));
 const missed=['07:30','12:30','19:30'].filter(s=>{const [h,m]=s.split(':').map(Number);const r=latest.get(s);return minutes>h*60+m+slotWindow&&!(r?.id&&['posted','verified_posted'].includes(r.meta?.publishStatus));});
 const reasons=[];
 if(minutes>=7*60+30&&plan?.jstDate!==jstDate)reasons.push('missing_today_plan');
 else if(plan?.jstDate===jstDate&&['research_required','editorial_fallback_review_required'].includes(plan.status))reasons.push(plan.reason||'no_qualified_product');
 if(eveningResult?.jstDate===jstDate&&eveningResult.phase==='evening'&&eveningResult.status==='research_required')reasons.push(eveningResult.reason||'evening_research_failed');
 if(missed.length)reasons.push('missed_slots');
 return {jstDate,status:reasons.length?'attention':'normal',reasons:[...new Set(reasons)],missedSlots:missed,lastDecision:lastDecision||null};
}
