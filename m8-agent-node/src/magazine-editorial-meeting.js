// Editorial planning, offline only. No publishing or causal claims.
import {planMagazineIssue} from './magazine-editorial.js';
export function planEditorialMeeting(day,slot='19:30',{history=[],observations=[]}={}){
 const base=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(base))throw Error('invalid_issue_date');
 const recent=history.filter(x=>x?.day<day).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,6);
 const candidates=Array.from({length:3},(_,i)=>{
  const sourceDay=new Date(base+i*86400000).toISOString().slice(0,10);
  const issue=planMagazineIssue(sourceDay,slot);
  const repeats=recent.filter(x=>x.topicId===issue.topicId).length;
  const lastIndex=recent.findIndex(x=>x.topicId===issue.topicId);
  return {issue,score:100-repeats*20-(lastIndex===0?40:0),repeats,lastIndex};
 }).sort((a,b)=>b.score-a.score);
 const chosen=candidates[0];
 const formats=['short','medium','feature'];
 const formatCounts=Object.fromEntries(formats.map(f=>[f,recent.filter(x=>x.format===f).length]));
 const preferredFormat=slot==='07:30'?'short':slot==='12:30'?'medium':'feature';
 const approaches=['empathy_example','unexpected_discovery','reader_comparison','scene_explanation'];
 const lastApproach=recent[0]?.approach;
 const approach=approaches.find(a=>a!==lastApproach&& !recent.slice(0,2).some(x=>x.approach===a))||approaches[0];
 return {status:'planning_only',day,slot,topicId:chosen.issue.topicId,title:chosen.issue.title,
  series:chosen.issue.series,researchKeyword:chosen.issue.researchKeyword,format:preferredFormat,approach,
  editorialSeed:chosen.issue.text,reason:'Prefer less recently covered topics; vary voice without inventing engagement evidence.',
  formatCounts,alternatives:candidates.map(c=>({topicId:c.issue.topicId,recentRepeats:c.repeats,score:c.score})),
  measuredObservations:observations.filter(x=>typeof x?.views==='number'&&Number.isFinite(x.views)&&x.views>=0).length,
  performanceUsedForRanking:false,publicationAllowed:false};
}
