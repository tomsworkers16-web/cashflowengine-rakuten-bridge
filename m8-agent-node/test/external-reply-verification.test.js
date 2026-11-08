import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeExternalReplyEngine, replyAppearsPublished, looksCorruptedJapanese} from '../src/external-reply-engine.js';

const candidate={author:'@questioner',url:'https://www.threads.com/@questioner/post/mock-1',
  text:'掃除が面倒なのでおすすめの時短方法ありませんか？ いつも困っています。'};
function mockPage({visible=false,clickFails=false}={}) {
  let submitted=0;
  const replyButton={count:async()=>1,click:async()=>{},first(){return this}};
  const submitButton={count:async()=>1,click:async()=>{
    submitted++;
    if(clickFails)throw Error('uncertain_click');
  },last(){return this},filter(){return this}};
  const editor={count:async()=>1,click:async()=>{},fill:async()=>{},
    last(){return this}};
  return {
    get clicks(){return submitted},
    goto:async()=>{},url:()=>candidate.url,waitForTimeout:async()=>{},
    evaluate:async(fn,arg)=>typeof arg==='string'?true:'safe',
    locator(selector){
      if(selector==='[data-cfe-confirmed-reply-submit="1"]')return submitButton;
      if(selector==='article')return {
        evaluateAll:async()=>submitted&&visible?[{author:'rakumitsu_select',
          text:'わかります。掃除は「始めるまでの手間」が減るだけでもかなりラクになりますよね。',
          permalink:true}]:[],
        first:()=>({getByRole:()=>replyButton})
      };
      return editor;
    },
    getByRole(role){return role==='textbox'?editor:submitButton},
    keyboard:{type:async()=>{}}
  };
}

function openTest() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-reply-'));
 const engine=makeExternalReplyEngine({dataDir:dir,ownUsername:'rakumitsu_select',
   enabled:true,maxPerDay:3,minScore:35});
 return {dir,engine,rows:()=>fs.existsSync(path.join(dir,'external-replies.jsonl'))
   ?fs.readFileSync(path.join(dir,'external-replies.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse):[],
   close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('reply verification requires author, text AND permalink',()=>{
 const t='正しい返信文です';
 assert.equal(replyAppearsPublished([{author:'rakumitsu_select',text:t,permalink:true}],
   'rakumitsu_select',t),true);
 assert.equal(replyAppearsPublished([{author:'other',text:t,permalink:true}],
   'rakumitsu_select',t),false);
 assert.equal(replyAppearsPublished([{author:'rakumitsu_select',text:t,permalink:false}],
   'rakumitsu_select',t),false);
});
test('mojibake sentinel rejects corrupt source and keeps valid Japanese',()=>{
 assert.equal(looksCorruptedJapanese('縺薙≧縺・≧'),true);
 assert.equal(looksCorruptedJapanese(candidate.text),false);
});
test('no visible published reply means unverified, never counted or resubmitted',async()=>{
 const t=openTest();
 try{
  const p=mockPage();
  const first=await t.engine.run(p,[candidate]);
  assert.equal(first.posted,0);
  assert.equal(first.unverified,1);
  assert.equal(p.clicks,1);
  assert.deepEqual(t.rows().map(r=>r.status),['pending','unverified']);
  await t.engine.run(p,[candidate]);
  assert.equal(p.clicks,1);
 }finally{t.close()}
});
test('uncertain submit error is not retried',async()=>{
 const t=openTest();
 try{
  const p=mockPage({clickFails:true});
  const result=await t.engine.run(p,[candidate]);
  assert.equal(result.posted,0);
  assert.equal(result.unverified,1);
  assert.equal(p.clicks,1);
  await t.engine.run(p,[candidate]);
  assert.equal(p.clicks,1);
 }finally{t.close()}
});
test('correct author and permalink after reload can produce verified posted',async()=>{
 const t=openTest();
 try{
  // Use a reply template controlled by the same production builder.
  const {buildReply}=await import('../src/external-reply-engine.js');
  const reply=buildReply(candidate);
  const p=mockPage({visible:true});
  const original=p.locator.bind(p);
  p.locator=(selector)=>{
   const result=original(selector);
   if(selector==='article'){
     result.evaluateAll=async()=>p.clicks?[{author:'rakumitsu_select',
       text:reply,permalink:true}]:[];
   }
   return result;
  };
  const result=await t.engine.run(p,[candidate]);
  assert.equal(result.posted,1);
  assert.equal(t.rows().at(-1).verification,'own_permalink_visible_after_reload');
 }finally{t.close()}
});

test('scoped reply submit never relies on generic Reply button',()=>{
 const source=fs.readFileSync(new URL('../src/external-reply-engine.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/getByRole\('button',\{name:\/返信/);
 assert.match(source,/data-cfe-confirmed-reply-submit/);
 assert.match(source,/target_url_changed_before_edit/);
 assert.match(source,/target_url_changed_after_edit/);
 assert.match(source,/reply_recipient_not_confirmed/);
 assert.match(source,/draft_text_mismatch/);
 assert.match(source,/inline_submit_not_unique/);
});
