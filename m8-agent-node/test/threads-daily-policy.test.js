import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DAILY_AUTO_POLICY} from '../src/threads-daily-cycle.js';
import {dailyAutoEnabled,dailyCycleEnabled,POLICY_FILE} from '../src/threads-daily-policy.js';
test('local policy is opt-in, scope checked, and invalid or paused policy holds daily mode',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-policy-'));const file=path.join(dir,POLICY_FILE);
 try{assert.equal(dailyCycleEnabled(dir,{}),false);assert.equal(dailyAutoEnabled(dir,{}),false);
 const p={policy:DAILY_AUTO_POLICY,account:'rakumitsu_select',scope:'own_posts_only',enabled:true};fs.writeFileSync(file,JSON.stringify(p));assert.equal(dailyAutoEnabled(dir,{}),true);assert.equal(dailyCycleEnabled(dir,{}),true);
 for(const change of [{enabled:false},{account:'another'},{scope:'all_replies'}]){fs.writeFileSync(file,JSON.stringify({...p,...change}));assert.equal(dailyAutoEnabled(dir,{}),false);assert.equal(dailyCycleEnabled(dir,{}),true);}
 fs.writeFileSync(file,'broken');assert.equal(dailyAutoEnabled(dir,{}),false);assert.equal(dailyCycleEnabled(dir,{}),true);
 }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('activation checks local health then persists only the scoped policy; pause does not restart legacy posting',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-activate-'));const file=path.join(dir,POLICY_FILE);
 let username='another';const server=http.createServer((req,res)=>{assert.equal(req.method,'GET');assert.equal(req.url,'/health');res.end(JSON.stringify({ok:true,threads:{ok:true,username},dailyAutoPublishEnabled:false,autoPostEnabled:true,slots:['07:30','12:30','19:30'],maxPostsPerDay:3,externalReply:{enabled:false}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env,CFE_DATA_DIR:dir,CFE_LOCAL_PORT:String(server.address().port),CFE_THREADS_DAILY_AUTO_PUBLISH:''};const cli=fileURLToPath(new URL('../src/activate-threads-daily-cycle.js',import.meta.url));const run=arg=>promisify(execFile)(process.execPath,[cli,arg],{env});
 try{await assert.rejects(run('--activate'));assert.deepEqual(fs.readdirSync(dir),[]);username='rakumitsu_select';const r=await run('--activate');assert.equal(JSON.parse(r.stdout).status,'enabled');assert.deepEqual(fs.readdirSync(dir),[POLICY_FILE]);assert.equal(dailyAutoEnabled(dir,{}),true);await run('--pause');assert.equal(dailyAutoEnabled(dir,{}),false);assert.equal(dailyCycleEnabled(dir,{}),true);}
 finally{await new Promise(resolve=>server.close(resolve));if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
