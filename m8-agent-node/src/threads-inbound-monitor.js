// Read-only monitor of incoming comments to the authenticated own account.
// No write-capable API method is exposed by this module.
import fs from 'node:fs';
import path from 'node:path';
import {planInboundReplies} from './threads-inbound-replies.js';
const fields='id,username,text,timestamp,is_reply,root_post,replied_to,hide_status';
export function inboundMonitorEnabled(dir,env=process.env){
 if(env.CFE_INBOUND_MONITOR_ENABLED==='true')return true;
 try{return fs.readFileSync(path.join(dir,'inbound-monitor.enabled'),'utf8').trim()==='own-account-read-only-v1';}catch{return false;}
}
export async function collectInboundReview({get,attempts=[],now=Date.now()}={}){
 if(typeof get!=='function')throw Error('missing_get');
 const me=await get('me',{fields:'id,username'});
 if(me?.username!=='rakumitsu_select')throw Error('wrong_account');
 const posts=await get('me/threads',{fields:'id,username,text,timestamp,is_reply',limit:'10'});
 if(!Array.isArray(posts?.data))throw Error('invalid_response');
 const roots=posts.data.filter(p=>p.is_reply===false&&p.username===me.username&&/^\d{1,30}$/.test(p.id)).slice(0,10);
 let complete=true;const candidates=[];let checked=0;
 for(const root of roots){
  let rows=[],after,done=false;
  for(let page=0;page<3;page++){
   const r=await get(root.id+'/conversation',{fields,limit:'50',reverse:'false',...(after?{after}:{})});
   if(!Array.isArray(r?.data))throw Error('invalid_response');rows.push(...r.data);
   if(!r.paging?.next){done=true;break;}
   const next=r.paging?.cursors?.after;if(typeof next!=='string'||!next||next===after)break;after=next;
  }
  checked++;if(!done){complete=false;continue;}
  candidates.push(...planInboundReplies({account:me.username,root,conversation:rows,attempts,now}));
 }
 return {mode:'read_only',scannedAt:new Date(now).toISOString(),roots:checked,complete,candidates,published:0};
}
export function readInboundAttempts(dir){
 const file=path.join(dir,'inbound-reply-attempts.jsonl');
 const attempts=fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)):[];
 for(const n of fs.readdirSync(dir))if(/^inbound-reply-intent-\d{1,30}\.json$/.test(n))attempts.push({targetId:n.match(/(\d+)\.json$/)[1]});
 return attempts;
}
export async function runInboundMonitor({dir,token,fetchFn=fetch,now=Date.now()}={}){
 if(!token)throw Error('missing_token');
 const get=async(endpoint,params)=>{
  const url=new URL('https://graph.threads.net/v1.0/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const r=await fetchFn(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('threads_http_'+r.status);return r.json();
 };
 const result=await collectInboundReview({get,attempts:readInboundAttempts(dir),now});
 const file=path.join(dir,'inbound-reply-review.json'),temp=file+'.tmp-'+process.pid;
 try{fs.writeFileSync(temp,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return {scannedAt:result.scannedAt,roots:result.roots,complete:result.complete,reviewCount:result.candidates.filter(c=>c.status==='review').length,holdCount:result.candidates.filter(c=>c.status==='hold').length,published:0};
}
