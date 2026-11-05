import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const listen = server => new Promise((resolve, reject) => {
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
});
const close = server => new Promise(resolve => server.close(resolve));
async function freePort() {
  const server=net.createServer();
  const port=await listen(server);
  await close(server);
  return port;
}
const delay = ms => new Promise(r=>setTimeout(r,ms));

test('offline end-to-end: Rakuten item -> PR copy -> mock Threads POST -> durable journal', {timeout:20000}, async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-mock-e2e-'));
  const mock={posts:0,requestText:null};
  const api=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(u.pathname==='/v1.0/me' && req.method==='GET')return res.end(JSON.stringify({id:'mock-user',username:'mock_profile'}));
    if(u.pathname==='/v1.0/me/threads' && req.method==='GET')return res.end(JSON.stringify({data:[]}));
    if(u.pathname==='/v1.0/me/threads' && req.method==='POST'){
      mock.posts++;
      mock.requestText=u.searchParams.get('text');
      return res.end(JSON.stringify({id:'mock-thread-1'}));
    }
    if(u.pathname==='/rakuten'){
      return res.end(JSON.stringify({Items:[{Item:{
        itemName:'模擬テスト収納グッズ',itemCode:'demo:123',itemPrice:1980,
        reviewCount:210,reviewAverage:4.5,shopName:'mock',
        affiliateUrl:'https://example.invalid/affiliate/demo123',
        postageFlag:0,pointRate:1
      }}]}));
    }
    res.statusCode=404;return res.end(JSON.stringify({error:'mock_404'}));
  });
  let agent=null;
  try{
    const apiPort=await listen(api);
    const corePort=await freePort();
    const jst=new Date(Date.now()+9*3600000);
    const slot=String(jst.getUTCHours()).padStart(2,'0')+':'+String(jst.getUTCMinutes()).padStart(2,'0');
    const minutes=jst.getUTCHours()*60+jst.getUTCMinutes();
    const earlier=(minutes+1440-30)%1440;
    const earlierSlot=String(Math.floor(earlier/60)).padStart(2,'0')+':'+String(earlier%60).padStart(2,'0');
    const env={...process.env,
      CFE_DATA_DIR:directory,THREADS_PROFILE_DIR:path.join(directory,'chrome'),
      CFE_LOCAL_PORT:String(corePort),CFE_AUTO_POST_ENABLED:'true',
      CFE_IMAGE_CARD_ENABLED:'false',CFE_IMAGE_POST_ENABLED:'false',
      CFE_EXTERNAL_REPLY_ENABLED:'false',CFE_CATCH_UP:'false',
      CFE_POST_SLOTS:earlierSlot+','+slot,CFE_MAX_POSTS_PER_DAY:'3',CFE_SLOT_WINDOW_MINUTES:'20',
      RAKUTEN_KEYWORDS:'test',THREADS_ACCESS_TOKEN:'offline-dummy',
      THREADS_USER_ID:'mock-user',THREADS_API_BASE:'http://127.0.0.1:'+apiPort+'/v1.0',
      RAKUTEN_API_BASE:'http://127.0.0.1:'+apiPort+'/rakuten',
      RAKUTEN_APPLICATION_ID:'offline-dummy',RAKUTEN_ACCESS_KEY:'offline-dummy',
      RAKUTEN_AFFILIATE_ID:'offline-dummy'};
    agent=spawn(process.execPath,['src/local-core-v2.js'],{cwd:process.cwd(),env,stdio:'ignore'});
    const journal=path.join(directory,'posts.jsonl');
    let rows=[];
    const until=Date.now()+12000;
    while(Date.now()<until){
      if(fs.existsSync(journal)){
        rows=fs.readFileSync(journal,'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
        if(rows.some(x=>x.id==='mock-thread-1'))break;
      }
      await delay(100);
    }
    assert.equal(mock.posts,1,'exactly one mock Threads POST');
    assert.match(mock.requestText,/【PR・アフィリエイト】/);
    assert.match(mock.requestText,/https:\/\/example\.invalid\/affiliate\/demo123/);
    assert.deepEqual(rows.map(x=>x.meta.publishStatus),['pending','posted']);
    assert.equal(rows.at(-1).meta.itemCode,'demo:123');
  }finally{
    if(agent && agent.exitCode===null)agent.kill();
    await close(api);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
