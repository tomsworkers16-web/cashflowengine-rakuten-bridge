// A bounded official API review. Only explicit approval of one fresh digest
// invokes a send. Default invocation is read-only; no scheduled execution.
import fs from 'node:fs';import path from 'node:path';
import {queryForTheme,selectOfficialExternalReview,sendReviewedExternal} from './threads-external-official-review.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data'),token=process.env.THREADS_ACCESS_TOKEN;
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const request=async(endpoint,params,method='GET')=>{const url=new URL('https://graph.threads.net/v1.0/'+endpoint);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('threads_http_'+r.status);return r.json();};
const get=(endpoint,params)=>request(endpoint,params);
try{
 const sending=process.argv.length===4&&process.argv[2]==='--send-approved'&&/^[a-f0-9]{64}$/.test(process.argv[3]);
 if((process.argv.length!==2&&!sending)||!token)throw Error('missing_token_or_invalid_action');
 const plan=JSON.parse(fs.readFileSync(path.join(dir,'threads-daily-proposal.json'),'utf8'));
 if(plan.jstDate!==day||plan.status!=='batch_review_required'||!queryForTheme(plan.theme))throw Error('no_current_theme');
 const me=await get('me',{fields:'id,username'});if(me?.username!=='rakumitsu_select')throw Error('wrong_account');
 const file=path.join(dir,'external-replies.jsonl');const history=fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)):[];
 for(const f of fs.readdirSync(dir))if(/^official-external-intent-\d{1,30}\.json$/.test(f))history.push(JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
 const data=await get('keyword_search',{q:queryForTheme(plan.theme),search_type:'TOP',fields:'id,username,text,timestamp,permalink,is_reply',limit:'25'});
 if(!Array.isArray(data?.data))throw Error('invalid_response');
 const candidate=selectOfficialExternalReview({rows:data.data,theme:plan.theme,history,account:me.username});
 if(!sending){console.log(JSON.stringify({mode:'review_only',candidate,published:0,sendEnabled:false},null,2));}
 else{
  if(!candidate||candidate.digest!==process.argv[3])throw Error('approval_mismatch');
  // Re-read the exact public post before submission, not another ranked result.
  const fresh=await get(candidate.targetId,{fields:'id,username,text,timestamp,permalink,is_reply'});
  const selected=selectOfficialExternalReview({rows:[fresh],theme:plan.theme,history,account:me.username});
  const result=await sendReviewedExternal({candidate:selected,digest:process.argv[3],reserve:c=>{
   const lock=path.join(dir,'official-external-day-'+day+'.json');const intent=path.join(dir,'official-external-intent-'+c.targetId+'.json');
   try{fs.writeFileSync(lock,JSON.stringify({targetId:c.targetId}),{flag:'wx',mode:0o600});fs.writeFileSync(intent,JSON.stringify({jstDate:day,targetId:c.targetId,url:c.url,author:c.author,status:'pending',digest:c.digest}),{flag:'wx',mode:0o600});return true;}catch{return false;}
  },create:c=>request('me/threads',{media_type:'TEXT',text:c.draft,reply_to_id:c.targetId},'POST'),publish:id=>request('me/threads_publish',{creation_id:id},'POST'),verify:id=>get(id,{fields:'id,username,text,is_reply,replied_to'})});
  if(result.status!=='hold')fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),jstDate:day,url:candidate.url,author:candidate.author,targetId:candidate.targetId,...result})+'\n','utf8');
  console.log(JSON.stringify(result));if(result.status!=='posted')process.exitCode=2;
 }
}catch(e){console.error(JSON.stringify({status:'hold',reason:/^(threads_http_\d{3}|wrong_account|no_current_theme|missing_token_or_invalid_action|invalid_response)$/.test(e.message)?e.message:'review_failed',published:0}));process.exitCode=1;}
