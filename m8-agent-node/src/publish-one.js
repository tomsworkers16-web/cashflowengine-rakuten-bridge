// One explicit, at-most-once affiliate TEXT post. No background schedule is enabled.
// Run: npm.cmd run publish-one. No retries of a publish request, even on timeout.
import fs from 'node:fs';
import path from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import { revenueText,validatePublicationText } from './product-posting.js';
import { publishTextOnce } from './posting-guard.js';

const env=process.env;
const dataDir=path.resolve(env.CFE_DATA_DIR||'.data');
const postsFile=path.join(dataDir,'posts.jsonl');
const apiBase=env.THREADS_API_BASE||'https://graph.threads.net/v1.0';
const rakutenBase=env.RAKUTEN_API_BASE||'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const localPort=Number(env.CFE_LOCAL_PORT||18787);
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const slot='manual-revenue-'+day;
const maxPosts=Math.max(1,Math.min(5,Number(env.CFE_MAX_POSTS_PER_DAY||3)));

function assert(condition,code){if(!condition)throw Error(code);}
function readJournal(){
 if(!fs.existsSync(postsFile))return [];
 return fs.readFileSync(postsFile,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}
function record(row){fs.mkdirSync(dataDir,{recursive:true});fs.appendFileSync(postsFile,JSON.stringify(row)+'\n','utf8');}
async function requestJson(url,{method='GET',timeoutMs=15000}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try {
  const res=await fetch(url,{method,signal:controller.signal});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error('http_'+res.status);
  return body;
 }finally{clearTimeout(timer);}
}
function threadsUrl(route,params={}){
 const u=new URL(apiBase+route);
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,String(value));
 u.searchParams.set('access_token',env.THREADS_ACCESS_TOKEN);
 return u;
}
async function threadsToday(){
 const body=await requestJson(threadsUrl('/me/threads',{fields:'id,text,timestamp,permalink',limit:50}));
 assert(Array.isArray(body.data),'threads_timeline_invalid');
 const since=new Date(day+'T00:00:00+09:00').getTime();
 return body.data.filter(x=>Date.parse(x.timestamp||'')>=since);
}
function safeItem(x){
 const item=x?.Item||x?.item||x||{};
 return {
  itemName:String(item.itemName||''), itemCode:String(item.itemCode||''),
  price:Number(item.itemPrice||0), affiliateUrl:String(item.affiliateUrl||''),
  reviewAverage:Number(item.reviewAverage||0),reviewCount:Number(item.reviewCount||0),
  postageFlag:item.postageFlag,pointRate:Number(item.pointRate||0)
 };
}
function itemScore(i){
 let score=0;
 if(i.reviewAverage>=4.5)score+=30;else if(i.reviewAverage>=4.2)score+=24;
 if(i.reviewCount>=500)score+=24;else if(i.reviewCount>=100)score+=16;
 if(i.price>=1000&&i.price<=5000)score+=20;else if(i.price>0)score+=8;
 if(i.postageFlag===0||i.postageFlag==='0')score+=10;
 return score;
}
async function chooseItem(journal){
 const keywords=(env.RAKUTEN_KEYWORDS||'キッチン 便利グッズ').split(',').map(x=>x.trim()).filter(Boolean).slice(0,5);
 const recently=new Set(journal.filter(x=>Date.parse(x.at||'')>=Date.now()-7*86400000)
  .map(x=>x.meta?.itemCode).filter(Boolean));
 for(const keyword of keywords){
  const q=new URL(rakutenBase);
  for(const [key,value] of Object.entries({applicationId:env.RAKUTEN_APPLICATION_ID,
   accessKey:env.RAKUTEN_ACCESS_KEY,affiliateId:env.RAKUTEN_AFFILIATE_ID,
   keyword,format:'json',hits:20,sort:'-reviewCount',availability:1,imageFlag:1}))
   q.searchParams.set(key,String(value));
  let response;
  try{response=await requestJson(q);}catch{continue;}
  const items=(response.Items||response.items||[]).map(safeItem)
    .filter(x=>x.itemCode&&x.itemName&&x.price>0&&/^https:\/\//.test(x.affiliateUrl)
      &&x.affiliateUrl.length<=470&&!recently.has(x.itemCode))
    .sort((a,b)=>itemScore(b)-itemScore(a));
  if(items.length)return {item:items[0],keyword};
 }
 throw Error('no_eligible_affiliate_item_in_rakuten_results');
}
function validateText(text,affiliateUrl){
 const error=validatePublicationText(text,{revenue:true,affiliateUrl});
 assert(!error,error||'invalid_publication_copy');
}
export async function publishOne({dryRun=false}={}){
 assert(env.THREADS_ACCESS_TOKEN&&env.RAKUTEN_APPLICATION_ID&&env.RAKUTEN_ACCESS_KEY&&env.RAKUTEN_AFFILIATE_ID,'credentials_missing');
 assert(String(env.CFE_AUTO_POST_ENABLED||'false').toLowerCase()==='false','scheduled_auto_post_must_be_disabled');
 assert(String(env.CFE_EXTERNAL_REPLY_ENABLED||'false').toLowerCase()==='false','external_reply_must_be_disabled');
 // Prevent racing a separate live scheduler or posting from unknown local configurations.
 const health=await requestJson('http://127.0.0.1:'+localPort+'/health');
 assert(health.ok&&health.autoPostEnabled===false&&health.externalReply?.enabled===false,'core_must_run_safely_with_all_publishing_disabled');
 assert(health.threads?.ok===true,'threads_core_health_failed');
 const journal=readJournal();
 assert(!journal.some(x=>x.jstDate===day&&x.slot===slot),'manual_slot_already_attempted_today');
 assert(!journal.some(x=>x.jstDate===day&&!x.id&&['pending','uncertain','unverified'].includes(x.meta?.publishStatus)),'unresolved_publication_exists_today');
 const timeline=await threadsToday();
 assert(timeline.length<maxPosts,'daily_threads_post_cap_reached');
 const {item,keyword}=await chooseItem(journal);
 const text=revenueText(item);
 validateText(text,item.affiliateUrl);
 assert(!journal.some(x=>x.jstDate===day&&x.text===text),'same_text_in_local_journal_today');
 assert(!timeline.some(x=>String(x.text||'').trim()===text.trim()),'same_text_already_on_threads');
 const info={mode:dryRun?'dry_run':'single_public_post',date:day,keyword,itemCode:item.itemCode,
  itemName:item.itemName,affiliateUrl:item.affiliateUrl,text,existingThreadsPostsToday:timeline.length,
  scheduledPostingEnabled:false,externalReplyEnabled:false};
 console.log(JSON.stringify({phase:'validated_candidate',...info},null,2));
 if(dryRun)return {status:'preview_ready',...info};
 const meta={role:'revenue',slot,catchup:false,copyPolicy:'product-first-v1',
  keyword,itemCode:item.itemCode,price:item.price,affiliate:true,singleRun:true};
 const result=await publishTextOnce({
  text,slot,jstDate:day,meta,record,
  send:async copy=>{
   const response=await requestJson(threadsUrl('/me/threads',
      {media_type:'TEXT',text:copy,auto_publish_text:'true'}),{method:'POST',timeoutMs:15000});
   return response.id;
  },
  lookup:threadsToday
 });
 console.log(JSON.stringify({phase:'publish_result',...result,postingRequestAttempted:true},null,2));
 if(!['posted','verified_posted'].includes(result.status))process.exitCode=2;
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 publishOne({dryRun:process.argv.includes('--dry-run')})
  .catch(e=>{console.error(JSON.stringify({ok:false,error:e.message,postingOutcome:'check_posts_journal_if_publish_was_attempted'}));process.exitCode=1;});
}
