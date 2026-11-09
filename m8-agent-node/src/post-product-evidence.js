// Offline audit of affiliate post exposure and separately reported Rakuten results.
// An itemCode match is *not* proof that a Threads post caused an order.
import fs from 'node:fs';
import path from 'node:path';
import {summarizePostJournal} from './report-posts.js';

const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function readRows(file){
 try{return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean)
  .map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);}
 catch{return [];}
}
export function evaluatePostProductEvidence({posts=[],insights=[],ledger={records:[]},targetDay,days=7}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDay)||!Number.isInteger(days)||days<1||days>31)
  throw new Error('invalid_evidence_window');
 const end=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(end))throw new Error('invalid_evidence_window');
 const from=new Date(end-(days-1)*86400000+9*3600000).toISOString().slice(0,10);
 const windowPosts=posts.filter(p=>typeof p?.jstDate==='string'&&p.jstDate>=from&&p.jstDate<=targetDay);
 const journal=summarizePostJournal(windowPosts);
 const byId=new Map();
 for(const item of insights){
  const id=String(item?.id??'');
  const views=number(item?.metrics?.views);
  if(id&&views!==null)byId.set(id,Math.max(byId.get(id)??0,views));
 }
 const published=journal.published.filter(p=>p?.meta?.role==='revenue');
 const postEvidence=published.map(p=>{
  const id=String(p.id),itemCode=typeof p?.meta?.itemCode==='string'?p.meta.itemCode:null;
  return {date:p.jstDate,slot:p.slot,postId:id,itemCode,
   views:byId.has(id)?byId.get(id):'unknown',
   state:'published',verifiedItemCode:Boolean(itemCode&&/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(itemCode))};
 }).sort((a,b)=>a.date.localeCompare(b.date)||String(a.slot).localeCompare(String(b.slot)));
 const ledgerRows=Array.isArray(ledger?.records)?ledger.records:[];
 const dailyReported=ledgerRows.filter(r=>r&&r.jstDate>=from&&r.jstDate<=targetDay&&typeof r.source==='string');
 const reportedItemCodes=new Set(dailyReported.map(r=>r.itemCode).filter(x=>typeof x==='string'));
 const matchingCodes=[...new Set(postEvidence.map(x=>x.itemCode).filter(x=>x&&reportedItemCodes.has(x)))];
 const exposures=postEvidence.filter(x=>typeof x.views==='number');
 const reportingDays=new Set(dailyReported.map(x=>x.jstDate));
 return {
  mode:'read_only_no_post',from,to:targetDay,
  publishedAffiliatePosts:postEvidence.length,
  publishedAffiliatePostsWithItemCode:postEvidence.filter(x=>x.verifiedItemCode).length,
  publishedAffiliatePostsWithObservedViews:exposures.length,
  publishedAffiliatePostsMissingViews:postEvidence.length-exposures.length,
  observedLifetimeViewsSum:exposures.length?exposures.reduce((s,x)=>s+x.views,0):'unknown',
  uncertainPostAttempts:journal.uncertainAttempts,
  affiliateReportDaysPresent:reportingDays.size,
  itemCodesAlsoInAffiliateRecords:matchingCodes,
  perPostRevenueAttribution:'unavailable',
  clickThroughRate:'unknown',
  confirmedPostProfitYen:'unknown',
  caveat:'Lifetime views are snapshots, not 7-day impressions. Daily/account-wide Rakuten clicks or orders are NOT attributable to individual Threads posts without tracking identifiers.',
  posts:postEvidence
 };
}
export function readLocalPostProductEvidence(dataDir,targetDay,days=7){
 const root=path.resolve(dataDir);
 const postRows=readRows(path.join(root,'posts.jsonl'));
 const reportDir=path.join(root,'reports');
 const insights=[];
 try{
  for(const filename of fs.readdirSync(reportDir).filter(x=>/^\d{4}-\d{2}-\d{2}-night\.json$/.test(x)).sort().slice(-31)){
   const report=readJson(path.join(reportDir,filename));
   if(Array.isArray(report?.threadsInsights?.posts))insights.push(...report.threadsInsights.posts);
  }
 }catch{}
 const ledger=readJson(path.join(root,'affiliate-results.json'))??{records:[]};
 return evaluatePostProductEvidence({posts:postRows,insights,ledger,targetDay,days});
}
