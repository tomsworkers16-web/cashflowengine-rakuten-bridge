import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTextOnce, findRecoverablePosts, postedNearAttempt, imageSubmitMayHaveHappened } from '../src/posting-guard.js';

const args = (overrides = {}) => ({
  text:'【PR】商品はこちら', slot:'12:30',jstDate:'2026-11-05',
  meta:{itemCode:'shop:100'},...overrides
});

test('journal is written BEFORE a single successful publish', async () => {
  const journal=[];
  let sent=0;
  const result=await publishTextOnce(args({
    record:r=>journal.push(r),
    send:async()=>{sent++;assert.equal(journal[0].meta.publishStatus,'pending');return 'threads-id';},
    lookup:async()=>{throw Error('lookup should not run');}
  }));
  assert.equal(sent,1);
  assert.equal(result.status,'posted');
  assert.deepEqual(journal.map(x=>x.meta.publishStatus), ['pending','posted']);
});

test('timeout with no verified post remains uncertain and is not retried', async () => {
  const journal=[];let sent=0;
  const result=await publishTextOnce(args({
    record:r=>journal.push(r),
    send:async()=>{sent++;throw Error('timeout');},
    lookup:async()=>[]
  }));
  assert.equal(sent,1);
  assert.equal(result.status,'uncertain');
  assert.deepEqual(journal.map(x=>x.meta.publishStatus), ['pending','uncertain']);
});

test('failed POST response with a matching official post is recovered', async () => {
  const journal=[];
  const result=await publishTextOnce(args({
    record:r=>journal.push(r),
    send:async()=>{throw Error('network_closed');},
    lookup:async()=>[{id:'confirmed-id',text:'【PR】商品はこちら',timestamp:new Date().toISOString()}]
  }));
  assert.equal(result.status,'verified_posted');
  assert.equal(result.id,'confirmed-id');
  assert.deepEqual(journal.map(x=>x.meta.publishStatus), ['pending','verified_posted']);
});

test('API verification outage does not cause another publish', async () => {
  const journal=[];
  const result=await publishTextOnce(args({
    record:r=>journal.push(r),
    send:async()=>{throw Error('timeout');},
    lookup:async()=>{throw Error('api_down');}
  }));
  assert.equal(result.status,'uncertain');
  assert.equal(journal.length,2);
});

test('failed intent journal stops all network activity', async () => {
  let sent=0;
  await assert.rejects(publishTextOnce(args({
    record:()=>{throw Error('disk_full');},
    send:async()=>{sent++;return 'x';},
    lookup:async()=>[]
  })),/disk_full/);
  assert.equal(sent,0);
});

test('uncertain post is recovered from official timeline without posting',()=>{
  const pending={at:'2026-11-05T03:30:00.000Z',jstDate:'2026-11-05',slot:'12:30',id:null,text:'unique copy',meta:{publishStatus:'pending'}};
  const row={...pending,at:'2026-11-05T03:30:05.000Z',meta:{publishStatus:'uncertain'}};
  const found=findRecoverablePosts([pending,row],[{id:'official-1',text:'unique copy',timestamp:'2026-11-05T03:30:04.000Z'}],'2026-11-05');
  assert.equal(found.length,1);assert.equal(found[0].id,'official-1');
  assert.equal(found[0].meta.publishStatus,'verified_posted');
});

test('ambiguous duplicate matching text is not reconciled',()=>{
  const a={jstDate:'2026-11-05',slot:'07:30',id:null,text:'same',meta:{publishStatus:'pending'}};
  const b={...a,slot:'12:30'};
  assert.deepEqual(findRecoverablePosts([a,b],[{id:'x',text:'same'}],'2026-11-05'),[]);
});

test('existing successful post IDs are never reused for reconciliation',()=>{
  const p={jstDate:'2026-11-05',slot:'07:30',id:'x',text:'one',meta:{publishStatus:'posted'}};
  const q={jstDate:'2026-11-05',slot:'12:30',id:null,text:'same',meta:{publishStatus:'uncertain'}};
  assert.deepEqual(findRecoverablePosts([p,q],[{id:'x',text:'same'}],'2026-11-05'),[]);
});

test('resolved slots are not reconciled repeatedly',()=>{
  const row={jstDate:'2026-11-05',slot:'12:30',id:null,text:'text',meta:{publishStatus:'uncertain'}};
  const done={...row,id:'confirmed',meta:{publishStatus:'verified_posted'}};
  assert.deepEqual(findRecoverablePosts([row,done],[{id:'confirmed',text:'text'}],'2026-11-05'),[]);
});

test('does not associate an older same-text post with a fresh publishing attempt',async()=>{
  const journal=[];
  const result=await publishTextOnce(args({
    record:r=>journal.push(r),
    send:async()=>{throw Error('timeout');},
    lookup:async()=>[{id:'old',text:'【PR】商品はこちら',timestamp:'2026-11-04T00:00:00Z'}]
  }));
  assert.equal(result.status,'uncertain');
});

test('reconciliation refuses missing timestamps and old same-text posts',()=>{
  const pending={at:'2026-11-05T03:30:00Z',jstDate:'2026-11-05',slot:'12:30',id:null,text:'same',meta:{publishStatus:'pending'}};
  const uncertain={...pending,at:'2026-11-05T03:31:00Z',meta:{publishStatus:'uncertain'}};
  assert.deepEqual(findRecoverablePosts([pending,uncertain],[{id:'old',text:'same',timestamp:'2026-11-05T01:30:00Z'}],'2026-11-05'),[]);
  assert.deepEqual(findRecoverablePosts([pending,uncertain],[{id:'missing-date',text:'same'}],'2026-11-05'),[]);
  assert.equal(postedNearAttempt({timestamp:'2026-11-05T03:31:00Z'},pending.at),true);
});

test('browser submit attempt is never treated as a safe text fallback',()=>{
  assert.equal(imageSubmitMayHaveHappened({submitAttempted:true}),true);
  assert.equal(imageSubmitMayHaveHappened(null,{submitAttempted:true}),true);
  assert.equal(imageSubmitMayHaveHappened({submitAttempted:false}),false);
});
