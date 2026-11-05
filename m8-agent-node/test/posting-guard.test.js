import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTextOnce } from '../src/posting-guard.js';

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
    lookup:async()=>[{id:'confirmed-id',text:'【PR】商品はこちら'}]
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
