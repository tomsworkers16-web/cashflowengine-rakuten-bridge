import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePostJournal } from '../src/report-posts.js';

const post=(slot,id,status='posted',role='revenue')=>({
  jstDate:'2026-11-05',slot,id,text:'test',meta:{role,publishStatus:status}
});

test('pending plus success counts as exactly one published post',()=>{
  const s=summarizePostJournal([post('12:30',null,'pending'),post('12:30','id-1')]);
  assert.equal(s.posts,1);assert.equal(s.uncertainAttempts,0);
  assert.deepEqual(s.postsByRole,{revenue:1});
});

test('an unresolved pending or uncertain request is never counted as a post',()=>{
  const s=summarizePostJournal([post('12:30',null,'pending'),post('19:30',null,'uncertain')]);
  assert.equal(s.posts,0);assert.equal(s.uncertainAttempts,2);
});

test('historical successful records without publishStatus remain supported',()=>{
  const s=summarizePostJournal([{jstDate:'2026-11-05',slot:'07:30',id:'old',meta:{role:'discovery'}}]);
  assert.equal(s.posts,1);assert.equal(s.postsByRole.discovery,1);
});

test('multiple slots count independently and latest transition wins',()=>{
  const s=summarizePostJournal([post('07:30',null,'pending'),post('07:30','id-1','verified_posted','discovery'),post('12:30','id-2')]);
  assert.equal(s.posts,2);assert.equal(s.uncertainAttempts,0);
});
