// Explicit owner-local enablement of read-only monitoring; no publishing.
import fs from 'node:fs';
import path from 'node:path';
import {runInboundMonitor} from './threads-inbound-monitor.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
try{
 if(process.argv.length!==2)throw Error('invalid_action');
 const port=Number(process.env.CFE_LOCAL_PORT||18787);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_port');
 const h=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(15000),redirect:'error'});
 const health=await h.json();if(!h.ok||health.ok!==true||health.threads?.username!=='rakumitsu_select'||health.threads?.ok!==true||typeof health.inboundReply?.monitorEnabled!=='boolean')throw Error('runtime_not_ready');
 const result=await runInboundMonitor({dir,token:process.env.THREADS_ACCESS_TOKEN});
 if(!result.complete||result.roots===0)throw Error('incomplete_review');
 const f=path.join(dir,'inbound-monitor.enabled');
 if(!fs.existsSync(f))fs.writeFileSync(f,'own-account-read-only-v1\n',{flag:'wx',mode:0o600});
 else if(fs.readFileSync(f,'utf8').trim()!=='own-account-read-only-v1')throw Error('existing_marker_invalid');
 console.log(JSON.stringify({status:'enabled',scope:'own-account-read-only',...result,autoSendEnabled:false},null,2));
}catch(e){console.error(JSON.stringify({status:'not_enabled',reason:/^(invalid_action|invalid_port|runtime_not_ready|incomplete_review|existing_marker_invalid|threads_http_\d{3}|missing_token|wrong_account|invalid_response)$/.test(e.message)?e.message:'monitor_failed',published:0}));process.exitCode=1;}
