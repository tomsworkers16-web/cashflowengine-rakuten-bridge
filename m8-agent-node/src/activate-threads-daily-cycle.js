// Explicit local owner action. Only writes a narrowly scoped policy file.
// No credential output, posting, scheduling, .env changes or process restarts.
import fs from 'node:fs';
import path from 'node:path';
import {DAILY_AUTO_POLICY,DAILY_SLOTS} from './threads-daily-cycle.js';
import {POLICY_FILE,readOwnerDailyPolicy} from './threads-daily-policy.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const file=path.join(dir,POLICY_FILE);
try{
 const action=process.argv[2];
 if(process.argv.length!==3||!['--activate','--pause'].includes(action))throw Error('explicit_action_required');
 if(action==='--activate'){
  const port=Number(process.env.CFE_LOCAL_PORT||18787);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_local_port');
  const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(15000),redirect:'error'});
  const health=await response.json();
  if(!response.ok||health.ok!==true||health.threads?.ok!==true||health.threads.username!=='rakumitsu_select'||typeof health.dailyAutoPublishEnabled!=='boolean'||health.autoPostEnabled!==true||JSON.stringify(health.slots)!==JSON.stringify(DAILY_SLOTS)||health.maxPostsPerDay!==3||health.externalReply?.enabled!==false)throw Error('runtime_not_ready');
 }
 if(process.env.CFE_THREADS_DAILY_AUTO_PUBLISH===DAILY_AUTO_POLICY)throw Error('environment_policy_set_use_existing_config');
 if(action==='--pause'&&!fs.existsSync(file))throw Error('no_local_policy_to_pause');
 const policy={policy:DAILY_AUTO_POLICY,account:'rakumitsu_select',scope:'own_posts_only',enabled:action==='--activate',updatedAt:new Date().toISOString()};
 if(action==='--activate'&&readOwnerDailyPolicy(dir)===DAILY_AUTO_POLICY){console.log(JSON.stringify({status:'already_enabled',published:0}));}
 else{
  const temp=file+'.tmp-'+process.pid;
  try{fs.writeFileSync(temp,JSON.stringify(policy,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}
  finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  console.log(JSON.stringify({status:policy.enabled?'enabled':'paused',scope:policy.scope,account:policy.account,published:0,externalRepliesEnabledByPolicy:false}));
 }
}catch(e){console.error(JSON.stringify({status:'not_changed',reason:/^(explicit_action_required|invalid_local_port|runtime_not_ready|environment_policy_set_use_existing_config|no_local_policy_to_pause)$/.test(e.message)?e.message:'activation_failed'}));process.exitCode=1;}
