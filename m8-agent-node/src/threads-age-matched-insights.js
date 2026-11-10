// Offline comparison at approximately equal post age from existing nightly snapshots.
// No Threads API, publication, file writes, external resources or conversion attribution.
import fs from 'node:fs';
import path from 'node:path';
import {summarizePostJournal} from './report-posts.js';
import {detectHookType} from './threads-hook-diagnostics.js';

const finiteViews=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const ageHours=(publishedAt,observedAt)=>(Date.parse(observedAt)-Date.parse(publishedAt))/3600000;
function readJson(filename){try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch{return null;}}
function readJsonl(filename){
 try{return fs.readFileSync(filename,'utf8').split(/\r?\n/).filter(Boolean).map(x=>{
  try{return JSON.parse(x);}catch{return null;}
 }).filter(Boolean);}catch{return [];}
}
export function summarizeAgeMatchedThreads(posts,reports,{targetDay,days=7,minHours=18,maxHours=36}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDay)||!Number.isInteger(days)||days<1||days>31
  ||!(minHours>=0)||!(maxHours>minHours)||maxHours>168)throw Error('invalid_age_comparison_window');
 const target=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(target))throw Error('invalid_age_comparison_window');
 const from=new Date(target-(days-1)*86400000+9*3600000).toISOString().slice(0,10);
 const recent=summarizePostJournal(posts.filter(p=>p&&p.jstDate>=from&&p.jstDate<=targetDay));
 const snapshots=new Map();
 for(const report of reports){
  const observedAt=report?.generatedAt;
  if(!Number.isFinite(Date.parse(observedAt)))continue;
  for(const metric of Array.isArray(report?.threadsInsights?.posts)?report.threadsInsights.posts:[]){
   const id=String(metric?.id??'');
   const v=finiteViews(metric?.metrics?.views);
   if(!id||v===null)continue;
   if(!snapshots.has(id))snapshots.set(id,[]);
   snapshots.get(id).push({observedAt,views:v});
  }
 }
 const records=[];
 for(const post of recent.published){
  const publishedAt=post?.at;
  const postId=String(post?.id??'');
  const validAt=typeof publishedAt==='string'&&Number.isFinite(Date.parse(publishedAt));
  const candidates=validAt?(snapshots.get(postId)??[]).map(x=>({...x,
   ageHours:ageHours(publishedAt,x.observedAt)}))
   .filter(x=>Number.isFinite(x.ageHours)&&x.ageHours>=minHours&&x.ageHours<=maxHours):[];
  // Prefer the observation closest to 24 hours, and earlier snapshot on tie.
  candidates.sort((a,b)=>Math.abs(a.ageHours-24)-Math.abs(b.ageHours-24)
   ||Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const chosen=candidates[0];
  records.push({date:post.jstDate,slot:String(post.slot||'unknown'),role:String(post.meta?.role||'unknown'),
   hook:detectHookType(post.text),
   postId,observationStatus:chosen?'observed':'missing',
   viewsNear24Hours:chosen?chosen.views:'unknown',
   actualAgeHours:chosen?Math.round(chosen.ageHours*10)/10:'unknown'});
 }
 const grouped=new Map();
 for(const rec of records){
  const key=rec.role+'/'+rec.hook;
  if(!grouped.has(key))grouped.set(key,{role:rec.role,hook:rec.hook,
   publishedPosts:0,postsWithAgeMatchedViews:0,totalAgeMatchedViews:0,missing:0});
  const g=grouped.get(key);g.publishedPosts++;
  if(typeof rec.viewsNear24Hours==='number'){
   g.postsWithAgeMatchedViews++;g.totalAgeMatchedViews+=rec.viewsNear24Hours;
  }else g.missing++;
 }
 return {mode:'read_only_no_post',from,to:targetDay,
  targetObservationAgeHours:24,acceptedAgeRangeHours:[minHours,maxHours],
  publishedPosts:records.length,observedPosts:records.filter(x=>x.observationStatus==='observed').length,
  groups:[...grouped.values()].map(g=>({...g,
   averageViewsNear24h:g.postsWithAgeMatchedViews
    ?Math.round(g.totalAgeMatchedViews/g.postsWithAgeMatchedViews*10)/10:'unknown',
   comparisonReady:g.postsWithAgeMatchedViews>=5}))
   .sort((a,b)=>b.postsWithAgeMatchedViews-a.postsWithAgeMatchedViews),
  observationCoverageWarning:records.some(x=>x.observationStatus==='missing'),
  recommendedAction:'Use comparable-age observations only as a descriptive benchmark; do not automatically select winning copy or modify posting schedules.',
  caveat:'Snapshots are observed between 18 and 36 hours after posting, not exact 24-hour metrics. Report availability, selection and audience differ; no causal effect, affiliate clicks, conversions or profit are established.',
  records};
}
export function readAgeMatchedThreads(dataDir,day,days=7){
 const root=path.resolve(dataDir);
 const posts=readJsonl(path.join(root,'posts.jsonl'));
 const folder=path.join(root,'reports'),reports=[];
 try{
  for(const file of fs.readdirSync(folder).filter(x=>/^\d{4}-\d{2}-\d{2}-night\.json$/.test(x)).sort().slice(-35)){
   const report=readJson(path.join(folder,file));if(report)reports.push(report);
  }
 }catch{}
 return summarizeAgeMatchedThreads(posts,reports,{targetDay:day,days});
}
