// Read-only descriptive grouping of verified published Threads posts.
// Never treats observed cumulative post views as impressions from a date range.
import fs from 'node:fs';
import path from 'node:path';
import {summarizePostJournal} from './report-posts.js';

function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}
function readLines(p){try{return fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(x=>{try{return JSON.parse(x);}catch{return null;}}).filter(Boolean);}catch{return [];}}
const views=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function detectHookType(text){
 const str=String(text??'').replace(/^【PR】\s*/u,'').trim().split(/\r?\n/)[0];
 if(!str)return 'empty_or_unknown';
 if(/[？?]$|^(?:なぜ|どうして|どっち|どれ|こんな|知って|これ、)/u.test(str))return 'question';
 if(/^(?:買う前|購入前|選ぶとき|選び方|比較|チェック)/u.test(str))return 'buyer_guide';
 if(/^(?:気になる|今日の|見つけた|注目|便利)/u.test(str))return 'generic_intro';
 if(/^[「『]/u.test(str))return 'product_name_first';
 return 'other';
}
export function summarizeThreadHooks(posts,insights,{targetDay,days=7}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDay)||!Number.isInteger(days)||days<1||days>31)throw new Error('invalid_date_window');
 const millis=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(millis))throw new Error('invalid_date_window');
 const from=new Date(millis-(days-1)*86400000+9*3600000).toISOString().slice(0,10);
 const recent=posts.filter(p=>p?.jstDate>=from&&p?.jstDate<=targetDay);
 const journal=summarizePostJournal(recent);
 const observed=new Map();
 for(const insight of insights){
  const id=String(insight?.id??'');
  const v=views(insight?.metrics?.views);
  if(id&&v!==null)observed.set(id,Math.max(observed.get(id)??0,v));
 }
 const groups=new Map();
 for(const post of journal.published){
  const role=String(post?.meta?.role||'unknown');
  const hook=detectHookType(post?.text);
  const slot=String(post?.slot||'unknown');
  const label=role+'/'+hook+'/'+slot;
  if(!groups.has(label))groups.set(label,{role,hook,slot,posts:0,postsWithObservedViews:0,
   viewsObservedTotal:0,missingViews:0});
  const group=groups.get(label);
  group.posts++;
  const value=observed.get(String(post.id));
  if(value===undefined)group.missingViews++;
  else {group.postsWithObservedViews++;group.viewsObservedTotal+=value;}
 }
 return {mode:'read_only_no_post',from,to:targetDay,verifiedPublishedPosts:journal.published.length,
  uncertainPostAttempts:journal.uncertainAttempts,
  groups:[...groups.values()].map(g=>({...g,
   averageLifetimeViewsObserved:g.postsWithObservedViews?Math.round(g.viewsObservedTotal/g.postsWithObservedViews*10)/10:'unknown',
   comparisonReady:g.postsWithObservedViews>=5}))
   .sort((a,b)=>b.viewsObservedTotal-a.viewsObservedTotal),
  recommendation:'Collect more observations before changing automated posting; groups with under five measured posts are directional only.',
  caveat:'Lifetime views are not period impressions; time since posting differs, and these observational groups cannot prove hook impact or attributable clicks/orders.'};
}
export function readLocalThreadHooks(dataDir,day,days=7){
 const root=path.resolve(dataDir),posts=readLines(path.join(root,'posts.jsonl'));
 const insights=[],folder=path.join(root,'reports');
 try{
  for(const file of fs.readdirSync(folder).filter(x=>/^\d{4}-\d{2}-\d{2}-night\.json$/.test(x)).sort().slice(-31)){
   const report=readJson(path.join(folder,file));
   if(Array.isArray(report?.threadsInsights?.posts))insights.push(...report.threadsInsights.posts);
  }
 }catch{}
 return summarizeThreadHooks(posts,insights,{targetDay:day,days});
}
