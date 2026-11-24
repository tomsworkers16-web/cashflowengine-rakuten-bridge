// An explicit owner-local opt-in after a verified real reply. No send here.
import fs from 'node:fs';import path from 'node:path';
import {INBOUND_AUTO_POLICY,readInboundAutoPolicy} from './threads-inbound-auto.js';
import {readInboundAttempts} from './threads-inbound-monitor.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data'),file=path.join(dir,'inbound-auto-policy.json');
try{
 const action=process.argv[2];if(process.argv.length!==3||!['--enable','--pause'].includes(action))throw Error('invalid_action');
 if(action==='--enable'){
  const port=Number(process.env.CFE_LOCAL_PORT||18787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_port');
  const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(15000),redirect:'error'});const h=await response.json();
  if(!response.ok||h.ok!==true||h.threads?.ok!==true||h.threads.username!=='rakumitsu_select'||h.inboundReply?.monitorEnabled!==true||typeof h.inboundReply?.autoSendEnabled!=='boolean'||h.externalReply?.enabled!==false)throw Error('runtime_not_ready');
  if(!readInboundAttempts(dir).some(r=>r.status==='posted'&&/^\d{1,30}$/.test(r.id||'')))throw Error('verified_test_required');
  if(readInboundAutoPolicy(dir)){console.log(JSON.stringify({status:'already_enabled',published:0}));process.exit(0);}
 }
 const policy={policy:INBOUND_AUTO_POLICY,account:'rakumitsu_select',enabled:action==='--enable',enabledAt:new Date().toISOString()};const temp=file+'.tmp-'+process.pid;
 try{fs.writeFileSync(temp,JSON.stringify(policy,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 console.log(JSON.stringify({status:policy.enabled?'enabled':'paused',scope:'own-incoming-only',maxPerDay:1,published:0,externalRepliesEnabled:false}));
}catch(e){console.error(JSON.stringify({status:'not_changed',reason:/^(invalid_action|invalid_port|runtime_not_ready|verified_test_required)$/.test(e.message)?e.message:'activation_failed',published:0}));process.exitCode=1;}
