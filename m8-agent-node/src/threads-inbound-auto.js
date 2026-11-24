// Standing owner authorization is narrowly limited to genuine incoming comments
// on our own threads. Never uses external discovery or likes/follows as targets.
import fs from 'node:fs';
import path from 'node:path';
import {collectInboundReview,readInboundAttempts,inboundMonitorEnabled} from './threads-inbound-monitor.js';
import {sendOneApprovedInbound} from './threads-inbound-replies.js';
export const INBOUND_AUTO_POLICY='own-incoming-replies-v1';
const account='rakumitsu_select',fields='id,username,text,timestamp,is_reply,root_post,replied_to,hide_status';
export function readInboundAutoPolicy(dir){
 try{const f=path.join(dir,'inbound-auto-policy.json');if(fs.statSync(f).size>4096)return null;const p=JSON.parse(fs.readFileSync(f,'utf8'));return p?.policy===INBOUND_AUTO_POLICY&&p.account===account&&p.enabled===true&&Number.isFinite(Date.parse(p.enabledAt))?p:null;}catch{return null;}
}
export function selectAutoInbound({review,policy,now=Date.now()}={}){
 if(policy?.policy!==INBOUND_AUTO_POLICY||policy.account!==account||policy.enabled!==true||review?.complete!==true||!Array.isArray(review.candidates))return null;
 const at=Date.parse(policy.enabledAt),scanned=Date.parse(review.scannedAt);if(!Number.isFinite(at)||at>now||!Number.isFinite(scanned)||scanned<at||scanned>now||now-scanned>600000)return null;
 // First release is deliberately limited to straightforward, low-risk replies.
 return review.candidates.find(c=>c.status==='review'&&['cleanup_burden','setup_burden','storage_discussion','laundry_burden','appreciation'].includes(c.intent)&&typeof c.draft==='string'&&c.draft.length<=180&&!/https?:\/\/|@|#|【PR】/u.test(c.draft)&&/^[a-f0-9]{64}$/.test(c.digest)&&Number.isFinite(Date.parse(c.receivedAt))&&Date.parse(c.receivedAt)>=at&&Date.parse(c.receivedAt)<=now)||null;
}
export async function runInboundAuto({dir,token,fetchFn=fetch,now=Date.now()}={}){
 const policy=readInboundAutoPolicy(dir);if(!policy||!inboundMonitorEnabled(dir)||!token)return {status:'hold',reason:'disabled_or_missing_token'};
 const day=new Date(now+9*3600000).toISOString().slice(0,10),dayFile=path.join(dir,'inbound-reply-day-'+day+'.json');
 if(fs.existsSync(dayFile))return {status:'hold',reason:'daily_cap_reached'};
 const request=async(endpoint,params,method='GET')=>{const url=new URL('https://graph.threads.net/v1.0/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);const r=await fetchFn(url,{method,headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('threads_http_'+r.status);return r.json();};
 const journal=path.join(dir,'inbound-reply-attempts.jsonl');
 // A verified prior single-reply test is required, even when a local marker exists.
 const attempts=readInboundAttempts(dir);if(!attempts.some(r=>r.status==='posted'&&/^\d{1,30}$/.test(r.id||'')))return {status:'hold',reason:'verified_test_required'};
 const review=await collectInboundReview({get:request,attempts,now});
 const c=selectAutoInbound({review,policy,now});if(!c)return {status:'hold',reason:review.complete?'no_eligible_new_comment':'incomplete_conversation'};
 const result=await sendOneApprovedInbound({candidates:[c],digest:c.digest,reserve:row=>{
  const current=readInboundAutoPolicy(dir);if(current?.enabledAt!==policy.enabledAt)return false;
  try{fs.writeFileSync(dayFile,JSON.stringify({targetId:row.targetId,authorization:INBOUND_AUTO_POLICY}),{flag:'wx',mode:0o600});fs.writeFileSync(path.join(dir,'inbound-reply-intent-'+row.targetId+'.json'),JSON.stringify({targetId:row.targetId,digest:row.digest,authorization:INBOUND_AUTO_POLICY}),{flag:'wx',mode:0o600});return true;}catch{return false;}
 },create:row=>request('me/threads',{media_type:'TEXT',text:row.draft,reply_to_id:row.targetId},'POST'),publish:cid=>request('me/threads_publish',{creation_id:cid},'POST'),verify:rid=>request(rid,{fields})});
 if(result.status!=='hold')fs.appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),targetId:c.targetId,authorization:INBOUND_AUTO_POLICY,...result})+'\n','utf8');
 return result;
}
