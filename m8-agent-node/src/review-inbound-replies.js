// Read-only official Threads API review. No external search or publication.
import fs from 'node:fs';
import path from 'node:path';
import {planInboundReplies,sendOneApprovedInbound} from './threads-inbound-replies.js';
const token=process.env.THREADS_ACCESS_TOKEN;
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const fields='id,username,text,timestamp,is_reply,root_post,replied_to,hide_status';
async function request(endpoint,params,method='GET'){
 const url=new URL('https://graph.threads.net/v1.0/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('threads_http_'+r.status);return r.json();
}
const get=(endpoint,params)=>request(endpoint,params);
async function collect(endpoint,params){
 let data=[],after;for(let i=0;i<3;i++){const p=await get(endpoint,{...params,limit:'50',...(after?{after}:{})});if(!Array.isArray(p.data))throw Error('invalid_response');data.push(...p.data);if(!p.paging?.next)return {data,complete:true};after=p.paging?.cursors?.after;if(typeof after!=='string'||!after)return {data,complete:false};}return {data,complete:false};
}
try{
 const sending=process.argv.length===4&&process.argv[2]==='--send-approved'&&/^[a-f0-9]{64}$/.test(process.argv[3]);
 if((process.argv.length!==2&&!sending)||!token)throw Error('missing_token_or_invalid_action');
 const me=await get('me',{fields:'id,username'});if(me.username!=='rakumitsu_select')throw Error('wrong_account');
 const posts=await get('me/threads',{fields:'id,username,text,timestamp,is_reply',limit:'10'});
 const file=path.join(dir,'inbound-reply-attempts.jsonl');const attempts=fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)):[];
 for(const name of fs.readdirSync(dir))if(/^inbound-reply-intent-\d{1,30}\.json$/.test(name))attempts.push({targetId:name.match(/(\d+)\.json$/)[1]});
 const candidates=[];let complete=true,roots=0;
 for(const root of (posts.data||[]).filter(p=>p.is_reply===false&&p.username===me.username&&/^\d{1,30}$/.test(p.id)).slice(0,10)){
  const r=await collect(root.id+'/conversation',{fields,reverse:'false'});roots++;if(!r.complete){complete=false;continue;}candidates.push(...planInboundReplies({account:me.username,root,conversation:r.data,attempts}));
 }
 if(!sending){console.log(JSON.stringify({mode:'read_only',roots,complete,candidates,published:0},null,2));}
 else if(!complete){console.log(JSON.stringify({status:'hold',reason:'incomplete_conversation',published:0}));process.exitCode=2;}
 else{
  const result=await sendOneApprovedInbound({candidates,digest:process.argv[3],reserve:c=>{
   const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
   // One explicit reply test per JST day, including uncertain attempts.
   if(fs.readdirSync(dir).some(n=>n==='inbound-reply-day-'+day+'.json'))return false;
   try{fs.writeFileSync(path.join(dir,'inbound-reply-day-'+day+'.json'),JSON.stringify({targetId:c.targetId}),{flag:'wx',mode:0o600});fs.writeFileSync(path.join(dir,'inbound-reply-intent-'+c.targetId+'.json'),JSON.stringify({targetId:c.targetId,digest:c.digest}),{flag:'wx',mode:0o600});return true;}catch{return false;}
  },create:c=>request('me/threads',{media_type:'TEXT',text:c.draft,reply_to_id:c.targetId},'POST'),publish:cid=>request('me/threads_publish',{creation_id:cid},'POST'),verify:rid=>get(rid,{fields})});
  if(result.status!=='hold')fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...result})+'\n','utf8');
  console.log(JSON.stringify(result));if(result.status!=='posted')process.exitCode=2;
 }
}catch(e){const reason=/^(threads_http_\d{3}|wrong_account|missing_token_or_invalid_action|invalid_response)$/.test(e.message)?e.message:'read_failed';console.error(JSON.stringify({mode:'read_only',status:'hold',reason,published:0}));process.exitCode=1;}
