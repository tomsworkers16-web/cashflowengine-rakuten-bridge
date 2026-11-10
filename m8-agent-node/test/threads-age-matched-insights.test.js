import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAgeMatchedThreads} from '../src/threads-age-matched-insights.js';
const t0='2026-11-08T03:30:00.000Z';
const post=(id='A',slot='12:30',date='2026-11-08')=>({
 jstDate:date,slot,id,at:t0,text:'【PR】\n買う前に比較したい便利グッズ',
 meta:{role:'revenue',publishStatus:'verified_posted'}
});
const report=(at,id,v)=>({generatedAt:at,threadsInsights:{posts:[{id,metrics:{views:v}}]}});
test('selects closest observed 24h snapshot rather than latest lifetime count',()=>{
 const result=summarizeAgeMatchedThreads([post()],[
  report('2026-11-08T05:30:00Z','A',2),
  report('2026-11-09T02:30:00Z','A',9),
  report('2026-11-09T04:30:00Z','A',11),
  report('2026-11-11T03:30:00Z','A',99)
 ],{targetDay:'2026-11-10'});
 assert.equal(result.records[0].viewsNear24Hours,9);
 assert.equal(result.records[0].actualAgeHours,23);
 assert.equal(result.records[0].observationStatus,'observed');
 assert.equal(result.groups[0].comparisonReady,false);
 assert.equal(result.mode,'read_only_no_post');
});
test('missing snapshot and unknown publication time remain unknown, not zero',()=>{
 const x=summarizeAgeMatchedThreads([post(),
  {jstDate:'2026-11-09',slot:'07:30',id:'B',text:'今日の便利グッズ',
   meta:{role:'guide',publishStatus:'verified_posted'}}],[
  report('2026-11-09T03:30:00Z','A',0),
  report('2026-11-09T03:30:00Z','B',12)
 ],{targetDay:'2026-11-10'});
 assert.equal(x.observedPosts,1);
 assert.equal(x.records.find(x=>x.postId==='A').viewsNear24Hours,0);
 assert.equal(x.records.find(x=>x.postId==='B').viewsNear24Hours,'unknown');
 assert.equal(x.observationCoverageWarning,true);
});
test('does not count unverified transition or duplicates twice',()=>{
 const p=post();
 const result=summarizeAgeMatchedThreads([
  {...p,id:null,meta:{role:'revenue',publishStatus:'pending'}},p,
  {...p,jstDate:'2026-11-09',slot:'19:30',id:null,
   meta:{role:'revenue',publishStatus:'unverified'}}
 ],[report('2026-11-09T03:30:00Z','A',3)],{targetDay:'2026-11-10'});
 assert.equal(result.publishedPosts,1);
 assert.equal(result.observedPosts,1);
 assert.equal(result.records[0].viewsNear24Hours,3);
});
test('unrelated or invalid aged snapshots do not create fake readings',()=>{
 const x=summarizeAgeMatchedThreads([post()],[
  report('2026-11-10T03:30:00Z','A',300),
  report('2026-11-09T03:30:00Z','different',123),
  report('2026-11-09T03:30:00Z','A',-1),
  {generatedAt:'invalid',threadsInsights:{posts:[{id:'A',metrics:{views:8}}]}}
 ],{targetDay:'2026-11-10'});
 assert.equal(x.records[0].viewsNear24Hours,'unknown');
 assert.equal(x.observedPosts,0);
 assert.throws(()=>summarizeAgeMatchedThreads([],[],{targetDay:'bad'}),/invalid_age/);
});

test('next-night snapshots include morning at 40 hours and evening at 28 hours without mixing slots',()=>{
 const a={...post('A','07:30'),at:'2026-11-08T07:30:00+09:00'};
 const b={...post('B','19:30'),at:'2026-11-08T19:30:00+09:00'};
 const r=summarizeAgeMatchedThreads([a,b],[report('2026-11-09T23:45:00+09:00','A',8),report('2026-11-09T23:45:00+09:00','B',4)],{targetDay:'2026-11-10'});
 assert.equal(r.observedPosts,2);
 assert.equal(r.records.find(x=>x.postId==='A').actualAgeHours,40.3);
 assert.equal(r.records.find(x=>x.postId==='B').actualAgeHours,28.3);
 assert.equal(r.groups.length,2);
 assert.deepEqual(r.groups.map(x=>x.slot).sort(),['07:30','19:30']);
 assert.equal(r.records.find(x=>x.postId==='A').viewsAtObservedAge,8);
});
