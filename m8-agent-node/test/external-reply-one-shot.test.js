import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chooseTestCandidates,validateCustomReply} from '../src/external-reply-one-shot.js';

const now=Date.parse('2026-11-09T00:30:00Z');
const row=(url,text='掃除が面倒なので時短グッズのおすすめを教えてください。困っています。')=>
  ({url,author:'@normal_account',text});

test('one-shot selects fresh eligible unattempted thread only',()=>{
  const candidate=row('https://www.threads.com/@normal_account/post/Safe1');
  const snapshot={scannedAt:new Date(now-1000).toISOString(),candidates:[
    candidate,
    row('https://evil.test/@x/post/Nope'),
    row('https://www.threads.com/@normal_account/post/Unsafe2','縺薙≧縺'),
    row('https://www.threads.com/@rakumitsu_select/post/Own')
  ]};
  const selected=chooseTestCandidates(snapshot,[],now);
  assert.deepEqual(selected.map(x=>x.url),[candidate.url]);
  assert.equal(chooseTestCandidates(snapshot,[{url:candidate.url,status:'unverified'}],now).length,0);
});
test('one-shot refuses stale candidate snapshot',()=>{
  assert.throws(()=>chooseTestCandidates({scannedAt:new Date(now-25*3600000).toISOString(),candidates:[]},[],now),
    /candidate_snapshot_stale_or_missing/);
});
test('one-shot preview never requires credentials or opens a browser',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-one-shot-preview-'));
 try {
   fs.writeFileSync(path.join(dir,'external-reply-candidates.json'),JSON.stringify({
     scannedAt:new Date().toISOString(),candidates:[
       row('https://www.threads.com/@normal_account/post/Safe1')
     ]}));
   const p=spawnSync(process.execPath,['src/external-reply-one-shot.js'],{
     cwd:process.cwd(),env:{...process.env,CFE_DATA_DIR:dir},encoding:'utf8',timeout:10000});
   assert.equal(p.status,0,p.stderr);
   const data=JSON.parse(p.stdout);
   assert.equal(data.noPosting,true);
   assert.equal(data.status,'preview_only');
   assert.equal(data.candidates.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('one-shot sends nothing without explicit exact URL',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-one-shot-refuse-'));
 try {
   fs.writeFileSync(path.join(dir,'external-reply-candidates.json'),JSON.stringify({
     scannedAt:new Date().toISOString(),candidates:[row('https://www.threads.com/@normal_account/post/Safe1')]}));
   const p=spawnSync(process.execPath,['src/external-reply-one-shot.js','--send-one'],{
     cwd:process.cwd(),env:{...process.env,CFE_DATA_DIR:dir,CFE_EXTERNAL_REPLY_ENABLED:'false'},
     encoding:'utf8',timeout:10000});
   assert.equal(p.status,1);
   assert.match(p.stderr,/url_must_match_an_eligible_preview_candidate/);
   assert.equal(fs.existsSync(path.join(dir,'external-replies.jsonl')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('custom reply permits real Japanese and rejects corrupt or promotional text',()=>{
 const valid='掃除機を出すのが面倒ですよね。床のホコリだけをフロアワイパーで取る方法もあります。';
 assert.equal(validateCustomReply(valid),valid);
 const natural='床に落ちた髪の毛をワイパーで取れば、掃除機の出番を減らしやすいですよ。';
 assert.equal(validateCustomReply(natural),natural);
 assert.throws(()=>validateCustomReply('縺薙≧縺・≧の返信になります。'),/mojibake/);
 assert.throws(()=>validateCustomReply('短い'),/length_invalid/);
 assert.throws(()=>validateCustomReply('掃除の方法はこちらから https://example.com を見てね！'),/promotional_link/);
});

test('selected candidate preview renders exact custom Japanese reply and never posts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-custom-reply-preview-'));
 const url='https://www.threads.com/@normal_account/post/Safe1';
 const reply='掃除機を出すのが面倒ですよね。床のホコリだけをフロアワイパーで取る方法もあります。';
 try{
  fs.writeFileSync(path.join(dir,'external-reply-candidates.json'),JSON.stringify({
   scannedAt:new Date().toISOString(),candidates:[row(url),row('https://www.threads.com/@another/post/Safe2')]}));
  const replyFile=path.join(dir,'test-reply.txt');
  fs.writeFileSync(replyFile,reply,'utf8');
  const p=spawnSync(process.execPath,['src/external-reply-one-shot.js','--url='+url,'--reply-file='+replyFile],{
   cwd:process.cwd(),env:{...process.env,CFE_DATA_DIR:dir},encoding:'utf8',timeout:10000});
  assert.equal(p.status,0,p.stderr);
  const data=JSON.parse(p.stdout);
  assert.equal(data.noPosting,true);
  assert.equal(data.candidates.length,1);
  assert.equal(data.candidates[0].url,url);
  assert.equal(data.candidates[0].replyText,reply);
  assert.equal(fs.existsSync(path.join(dir,'external-replies.jsonl')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('invalid custom reply is rejected before reserving or sending',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-custom-reply-reject-'));
 const url='https://www.threads.com/@normal_account/post/Safe1';
 try{
  fs.writeFileSync(path.join(dir,'external-reply-candidates.json'),JSON.stringify({
   scannedAt:new Date().toISOString(),candidates:[row(url)]}));
  const file=path.join(dir,'reply.txt');fs.writeFileSync(file,'縺薙≧縺・≧','utf8');
  const p=spawnSync(process.execPath,['src/external-reply-one-shot.js','--send-one','--url='+url,'--reply-file='+file],{
   cwd:process.cwd(),env:{...process.env,CFE_DATA_DIR:dir},encoding:'utf8',timeout:10000});
  assert.equal(p.status,1);assert.match(p.stderr,/reply_text_/);
  assert.equal(fs.readdirSync(dir).some(x=>x.startsWith('external-reply-one-shot-')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
