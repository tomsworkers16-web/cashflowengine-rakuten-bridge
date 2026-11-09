import test from 'node:test';
import assert from 'node:assert/strict';
import {detectHookType,summarizeThreadHooks} from '../src/threads-hook-diagnostics.js';
const post=(slot,id,text,role='revenue')=>({jstDate:'2026-11-09',slot,id,text,meta:{role,publishStatus:'verified_posted'}});
test('hook categories are descriptive only and do not expose raw text',()=>{
 assert.equal(detectHookType('【PR】\n買う前に比較したい便利グッズ'),'buyer_guide');
 assert.equal(detectHookType('【PR】\n「商品名」'),'product_name_first');
 assert.equal(detectHookType('便利グッズを選ぶとき、どこを見る？'),'question');
 assert.equal(detectHookType('今日の便利グッズ'),'generic_intro');
});
test('latest verified slot wins, report keeps missing views unknown and no causation',()=>{
 const entries=[
 {jstDate:'2026-11-09',slot:'12:30',id:null,meta:{publishStatus:'pending',role:'revenue'}},
 post('12:30','a','【PR】\n今日の便利グッズ'),
 post('19:30','b','買う前に比較したい便利グッズ','guide'),
 {jstDate:'2026-11-09',slot:'07:30',id:null,meta:{publishStatus:'unverified'}}
 ];
 const r=summarizeThreadHooks(entries,[{id:'a',metrics:{views:2}},{id:'a',metrics:{views:5}}],
  {targetDay:'2026-11-10'});
 assert.equal(r.verifiedPublishedPosts,2);
 assert.equal(r.uncertainPostAttempts,1);
 assert.ok(r.groups.every(g=>g.comparisonReady===false));
 assert.equal(r.groups.find(g=>g.role==='revenue').viewsObservedTotal,5);
 assert.equal(r.groups.find(g=>g.role==='guide').averageLifetimeViewsObserved,'unknown');
 assert.equal(r.mode,'read_only_no_post');
 assert.ok(!JSON.stringify(r).includes('今日の便利グッズ'));
 assert.match(r.caveat,/cannot prove/);
});
test('empty reports and invalid dates stay safe',()=>{
 const r=summarizeThreadHooks([],[],{targetDay:'2026-11-10'});
 assert.equal(r.groups.length,0);
 assert.throws(()=>summarizeThreadHooks([],[],{targetDay:'bad'}),/invalid_date_window/);
});
