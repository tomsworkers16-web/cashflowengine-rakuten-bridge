import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function run(env,args=[]){
 return new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,['src/publish-one.js',...args],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  proc.stdout.on('data',d=>stdout+=d);
  proc.stderr.on('data',d=>stderr+=d);
  proc.on('error',reject);
  proc.on('close',code=>resolve({code,stdout,stderr}));
 });
}
test('explicit one-shot publishes exactly once; dry-run performs no POST and retry is refused',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-single-'));
 let sends=0;
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/health')return res.end(JSON.stringify({ok:true,autoPostEnabled:false,
   externalReply:{enabled:false},threads:{ok:true}}));
  if(u.pathname==='/v1.0/me/threads'&&req.method==='GET')return res.end(JSON.stringify({data:[]}));
  if(u.pathname==='/v1.0/me/threads'&&req.method==='POST'){
   sends++;
   return res.end(JSON.stringify({id:'mock-post-121'}));
  }
  if(u.pathname==='/rakuten')return res.end(JSON.stringify({Items:[{Item:{
   itemName:'テスト用 キッチングッズ',itemCode:'store:987',itemPrice:2300,
   affiliateUrl:'https://example.invalid/affiliate/123',reviewCount:200,reviewAverage:4.6,
   postageFlag:0
  }}]}));
  res.statusCode=404;res.end('{}');
 });
 try{
  const port=await listen(server);
  const env={...process.env,
   CFE_DATA_DIR:dir,CFE_LOCAL_PORT:String(port),
   THREADS_API_BASE:'http://127.0.0.1:'+port+'/v1.0',
   RAKUTEN_API_BASE:'http://127.0.0.1:'+port+'/rakuten',
   THREADS_ACCESS_TOKEN:'dummy',RAKUTEN_APPLICATION_ID:'dummy',
   RAKUTEN_ACCESS_KEY:'dummy',RAKUTEN_AFFILIATE_ID:'dummy',
   CFE_AUTO_POST_ENABLED:'false',CFE_EXTERNAL_REPLY_ENABLED:'false',
   RAKUTEN_KEYWORDS:'キッチン 便利グッズ'};
  const preview=await run(env,['--dry-run']);
  assert.equal(preview.code,0,preview.stderr);
  assert.match(preview.stdout,/\"mode\": \"dry_run\"/);
  assert.equal(sends,0);
  assert.equal(fs.existsSync(path.join(dir,'posts.jsonl')),false);
  const live=await run(env);
  assert.equal(live.code,0,live.stderr);
  assert.match(live.stdout,/mock-post-121/);
  assert.equal(sends,1);
  const records=fs.readFileSync(path.join(dir,'posts.jsonl'),'utf8')
   .trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(records.map(x=>x.meta.publishStatus),['pending','posted']);
  assert.equal(records[1].meta.role,'revenue');
  assert.match(records[1].text,/【PR・アフィリエイト】/);
  assert.match(records[1].text,/https:\/\/example\.invalid\/affiliate\/123/);
  const again=await run(env);
  assert.notEqual(again.code,0);
  assert.match(again.stderr,/manual_slot_already_attempted_today/);
  assert.equal(sends,1);
 }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('a local core that is still auto-posting blocks manual publication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-single-blocked-'));
 let sends=0;
 const server=http.createServer((req,res)=>{
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');
   return res.end(JSON.stringify({ok:true,autoPostEnabled:true,
    externalReply:{enabled:false},threads:{ok:true}}));}
  sends++;res.statusCode=500;res.end('{}');
 });
 try{
  const port=await listen(server);
  const env={...process.env,CFE_DATA_DIR:dir,CFE_LOCAL_PORT:String(port),
   THREADS_ACCESS_TOKEN:'dummy',RAKUTEN_APPLICATION_ID:'dummy',
   RAKUTEN_ACCESS_KEY:'dummy',RAKUTEN_AFFILIATE_ID:'dummy',
   CFE_AUTO_POST_ENABLED:'false',CFE_EXTERNAL_REPLY_ENABLED:'false'};
  const result=await run(env);
  assert.notEqual(result.code,0);
  assert.match(result.stderr,/core_must_run_safely/);
  assert.equal(sends,0);
 }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});
