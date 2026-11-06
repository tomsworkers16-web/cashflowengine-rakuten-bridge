// Local evidence only: distinguish posted affiliate copy from observed exposure.
// No API calls, raw post text, URLs or per-post financial attribution.
import fs from 'node:fs';
import path from 'node:path';
import {summarizePostJournal} from './report-posts.js';

function json(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function journal(file){
 try{return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean)
  .map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);}
 catch{return [];}
}
export function summarizeLocalAffiliateExposure(dataDir,targetDay,days=7){
 const target=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(target)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(targetDay))
  throw Error('invalid_target_day');
 const from=new Date(target-(days-1)*86400000+9*3600000).toISOString().slice(0,10);
 const posts=journal(path.join(dataDir,'posts.jsonl')).filter(row=>{
  const d=String(row?.jstDate||'');
  return d>=from&&d<=targetDay;
 });
 const summary=summarizePostJournal(posts);
 const revenues=summary.published.filter(x=>x.meta?.role==='revenue');
 const views=new Map();
 const reportDir=path.join(dataDir,'reports');
 try{
  const files=fs.readdirSync(reportDir).filter(x=>/^\d{4}-\d{2}-\d{2}-night\.json$/.test(x))
   .sort().slice(-20);
  for(const file of files){
   const data=json(path.join(reportDir,file));
   for(const insight of Array.isArray(data?.threadsInsights?.posts)?data.threadsInsights.posts:[]){
    const id=String(insight?.id||'');
    const v=insight?.metrics?.views;
    if(id&&typeof v==='number'&&Number.isFinite(v)&&v>=0)
     views.set(id,Math.max(v,views.get(id)||0));
   }
  }
 }catch{}
 const measured=revenues.filter(p=>views.has(String(p.id)));
 const totalViews=measured.reduce((n,p)=>n+views.get(String(p.id)),0);
 return {from,to:targetDay,publishedPosts:summary.posts,
  affiliatePosts:revenues.length,affiliatePostsWithViews:measured.length,
  affiliatePostsMissingViews:revenues.length-measured.length,
  affiliatePostLifetimeViewsObserved:measured.length?totalViews:'unknown',
  affiliatePostMeanViewsObserved:measured.length
   ?Math.round(totalViews/measured.length*10)/10:'unknown',
  uncertainPostAttempts:summary.uncertainAttempts,
  observation:'Post lifetime views, not account profile views. No Rakuten click or sale attribution.'};
}
