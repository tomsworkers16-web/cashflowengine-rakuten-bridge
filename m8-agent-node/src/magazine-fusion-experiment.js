// Read-only experiment analysis. Explicit assignment records prevent retroactive labeling.
import {summarizeAgeMatchedThreads} from './threads-age-matched-insights.js';
const arms=new Set(['baseline','fusion']);
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
function validAssignments(rows){
 if(!Array.isArray(rows))throw Error('experiment_assignments_invalid');
 const ids=new Set(),out=[];
 for(const row of rows){
  if(!row||!arms.has(row.arm)||!/^\d+$/.test(String(row.postId??''))||!dayPattern.test(String(row.jstDate||''))||!['07:30','12:30','19:30'].includes(row.slot)||typeof row.itemCode!=='string'||!/^[\w-]+:[\w-]+$/.test(row.itemCode))throw Error('experiment_assignment_invalid');
  if(ids.has(String(row.postId)))throw Error('experiment_duplicate_post_id');
  ids.add(String(row.postId));
  out.push({postId:String(row.postId),jstDate:row.jstDate,slot:row.slot,arm:row.arm,itemCode:row.itemCode,topicId:String(row.topicId||'unknown')});
 }
 return out;
}
export function summarizeFusionExperiment(assignments,posts,reports,{targetDay,days=14}={}){
 const labels=validAssignments(assignments);
 const observations=summarizeAgeMatchedThreads(posts,reports,{targetDay,days});
 const byId=new Map(observations.records.map(x=>[String(x.postId),x]));
 const groups=[];
 for(const arm of ['baseline','fusion'])for(const slot of ['07:30','12:30','19:30']){
  const rows=labels.filter(x=>x.arm===arm&&x.slot===slot&&x.jstDate>=observations.from&&x.jstDate<=targetDay);
  if(!rows.length)continue;
  const joined=rows.map(x=>({label:x,observation:byId.get(x.postId)}));
  const measured=joined.filter(x=>typeof x.observation?.viewsNear24Hours==='number');
  const sum=measured.reduce((n,x)=>n+x.observation.viewsNear24Hours,0);
  groups.push({arm,slot,assignedPosts:rows.length,observedPosts:measured.length,missingViews:rows.length-measured.length,averageViewsNear24h:measured.length?Math.round(10*sum/measured.length)/10:'unknown',eligibleForExploratoryComparison:measured.length>=5});
 }
 const comparableSlots=['07:30','12:30','19:30'].filter(slot=>arms.size===2&&[...arms].every(arm=>groups.some(g=>g.arm===arm&&g.slot===slot&&g.eligibleForExploratoryComparison)));
 return {mode:'read_only_no_post',assignmentCount:labels.length,observationsWindow:[observations.from,targetDay],groups,comparableSlots,affiliateClicks:'unknown',affiliateOrders:'unknown',affiliateRewardYen:'unknown',netProfitYen:'unknown',winner:'undetermined',canInferCausality:false,publicationAllowed:false,
 caveat:'Assignments must be recorded before publication. Approximate post-age views are observational; posting slots, audience, topic and product differ. Rakuten daily reports cannot prove post-level clicks or commissions without attribution identifiers.'};
}
