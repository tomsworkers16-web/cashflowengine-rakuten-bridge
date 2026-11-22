// Source-reported item performance may inform *research*, never autonomous posting.
// Does not attribute marketplace orders to a Threads post without a tracking identifier.
function count(v){return Number.isSafeInteger(v)&&v>=0?v:null}
function money(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null}
export function prioritizeEditorialResearch({candidates=[],records=[],minClicks=5}={}) {
 if(!Array.isArray(candidates)||!Array.isArray(records))throw new TypeError('invalid_research_inputs');
 if(!Number.isSafeInteger(minClicks)||minClicks<1||minClicks>1000)throw new TypeError('invalid_min_clicks');
 const seenRecordIds=new Set(),byItem=new Map(),duplicates=[];
 for(const row of records){
  if(!row||typeof row.source!=='string'||!row.source.trim()||typeof row.itemCode!=='string'||!row.itemCode.trim())continue;
  const id=typeof row.recordId==='string'?row.recordId.trim():'';
  if(!id)continue; // Cannot safely distinguish repeat exports without a stable record identifier.
  const key=row.source+'/'+id;
  if(seenRecordIds.has(key)){duplicates.push(key);continue}
  seenRecordIds.add(key);
  const clicks=count(row.clicks),orders=count(row.orders),reward=money(row.rewardYen),cost=money(row.costYen);
  if(clicks===null||orders===null||reward===null||cost===null)continue;
  const current=byItem.get(row.itemCode)||{clicks:0,orders:0,confirmedRewardYen:0,costYen:0,confirmed:true,rows:0};
  current.clicks+=clicks;current.orders+=orders;current.confirmedRewardYen+=reward;current.costYen+=cost;current.rows++;
  if(row.rewardStatus!=='confirmed')current.confirmed=false;
  byItem.set(row.itemCode,current);
 }
 const selected=[];
 for(const c of candidates){
  const itemCode=c?.itemCode;
  if(typeof itemCode!=='string')continue;
  const e=byItem.get(itemCode);
  const status=!e||!e.rows?'data_insufficient':!e.confirmed?'reward_unconfirmed':e.clicks<minClicks?'sample_too_small':'observed';
  const net=status==='observed'?e.confirmedRewardYen-e.costYen:null;
  const priority=status==='observed'&&net>0?'research_positive_observed':status==='observed'&&net<0?'review_negative_observed':'research_unverified';
  selected.push({itemCode,theme:c.theme||'unknown',rankingPriority:c.priority??null,
    evidenceStatus:status,observedClicks:e?.clicks??null,observedOrders:e?.orders??null,
    confirmedNetYen:net,confirmedYenPerClick:net===null||e.clicks===0?null:net/e.clicks,
    researchPriority:priority,
    attribution:'source_reported_item_level_only_no_post_attribution',publishApproved:false});
 }
 selected.sort((a,b)=>{
  const p={research_positive_observed:0,research_unverified:1,review_negative_observed:2};
  return p[a.researchPriority]-p[b.researchPriority]||
   ((b.confirmedNetYen??-Infinity)-(a.confirmedNetYen??-Infinity))||
   ((b.rankingPriority??0)-(a.rankingPriority??0));
 });
 return {mode:'offline_research_only',items:selected,
   summary:{scanned:candidates.length,withConfirmedEvidence:selected.filter(x=>x.evidenceStatus==='observed').length,
     duplicatedRecordIds:duplicates.length,published:0},
   caveat:'Observed affiliate metrics do not prove which post or article generated an order. Missing or provisional data never becomes realized profit.'};
}
