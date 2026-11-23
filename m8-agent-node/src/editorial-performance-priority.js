// Source-reported item performance may inform research, never autonomous posting.
import { inspectEditorialPerformanceEvidence } from './editorial-performance-evidence-audit.js';

export function prioritizeEditorialResearch({candidates=[],records=[],minClicks=5}={}) {
 if(!Array.isArray(candidates)||!Array.isArray(records))throw new TypeError('invalid_research_inputs');
 if(!Number.isSafeInteger(minClicks)||minClicks<1||minClicks>1000)throw new TypeError('invalid_min_clicks');
 const {audit,eligible,blocked}=inspectEditorialPerformanceEvidence({records});
 const byItem=new Map();
 for(const row of eligible){
  const current=byItem.get(row.itemCode)||{clicks:0,orders:0,confirmedRewardYen:0,costYen:0,overflow:false};
  for(const [key,value] of [['clicks',row.clicks],['orders',row.orders],['confirmedRewardYen',row.rewardYen],['costYen',row.costYen]]){
   current[key]+=value;
   if(!Number.isSafeInteger(current[key]))current.overflow=true;
  }
  byItem.set(row.itemCode,current);
 }
 const selected=[];
 for(const c of candidates){
  const itemCode=c?.itemCode;
  if(typeof itemCode!=='string'||!itemCode.trim())continue;
  const e=byItem.get(itemCode), issues=blocked.get(itemCode);
  const status=issues?.has('conflicting_evidence')?'conflicting_evidence':issues?.has('data_insufficient')||e?.overflow?'data_insufficient':
   issues?.has('reward_unconfirmed')?'reward_unconfirmed':!e?'data_insufficient':e.clicks<minClicks?'sample_too_small':'observed';
  const net=status==='observed'?e.confirmedRewardYen-e.costYen:null;
  const priority=status==='observed'&&net>0?'research_positive_observed':status==='observed'&&net<0?'review_negative_observed':'research_unverified';
  const usable=e&&!e.overflow&&!issues;
  selected.push({itemCode,theme:c.theme||'unknown',rankingPriority:Number.isFinite(c.priority)?c.priority:null,
    evidenceStatus:status,observedClicks:usable?e.clicks:null,observedOrders:usable?e.orders:null,
    confirmedNetYen:net,confirmedYenPerClick:net===null||e.clicks===0?null:net/e.clicks,
    researchPriority:priority,researchLane:priority==='research_positive_observed'?'validated_candidate':priority==='review_negative_observed'?'loss_review':'experiment',
    attribution:'source_reported_item_level_only_no_post_attribution',publishApproved:false});
 }
 selected.sort((a,b)=>{
  const p={research_positive_observed:0,research_unverified:1,review_negative_observed:2};
  return p[a.researchPriority]-p[b.researchPriority]||
   ((b.confirmedNetYen??-Infinity)-(a.confirmedNetYen??-Infinity))||
   ((b.rankingPriority??0)-(a.rankingPriority??0));
 });
 return {mode:'offline_research_only',items:selected,evidenceAudit:audit,
   summary:{scanned:candidates.length,withConfirmedEvidence:selected.filter(x=>x.evidenceStatus==='observed').length,
     duplicatedRecordIds:audit.repeatedRows||0,conflictingRecordIds:audit.conflictingRecordIds||0,published:0},
   caveat:'Observed affiliate metrics do not prove which post or article generated an order. Missing or provisional data never becomes realized profit.'};
}
