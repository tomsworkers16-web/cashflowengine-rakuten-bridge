import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeEditorialResearch} from '../src/editorial-performance-priority.js';
const c=[{itemCode:'a:1',theme:'storage',priority:35},{itemCode:'b:2',priority:45}];
const record=(changes={})=>({source:'rakuten_dashboard',recordId:'r1',itemCode:'a:1',clicks:10,orders:2,rewardYen:400,costYen:60,rewardStatus:'confirmed',...changes});
test('confirmed item-level metrics prioritize positive net evidence',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record()]});
 assert.equal(r.items[0].itemCode,'a:1');
 assert.equal(r.items[0].confirmedNetYen,340);
 assert.equal(r.items[0].confirmedYenPerClick,34);
 assert.equal(r.items[0].researchPriority,'research_positive_observed');
 assert.equal(r.summary.published,0);
});
test('unconfirmed reward never becomes realized profit',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record({rewardStatus:'provisional'})]});
 assert.equal(r.items.find(x=>x.itemCode==='a:1').confirmedNetYen,null);
});
test('small sample not promoted even if profit positive',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record({clicks:2})]});
 assert.equal(r.items.find(x=>x.itemCode==='a:1').evidenceStatus,'sample_too_small');
});
test('missing clicks or costs is unknown, not zero',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record({costYen:null})]});
 assert.equal(r.items.find(x=>x.itemCode==='a:1').evidenceStatus,'data_insufficient');
 assert.equal(r.items.find(x=>x.itemCode==='a:1').confirmedNetYen,null);
});
test('record id prevents repeated export inflating earnings',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record(),record()]});
 assert.equal(r.summary.duplicatedRecordIds,1);
 assert.equal(r.items[0].observedClicks,10);
});
test('no record id excluded because could duplicate',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record({recordId:''})]});
 assert.equal(r.summary.withConfirmedEvidence,0);
});
test('loss is flagged for review, not auto-boosted',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record({rewardYen:5,costYen:500})]});
 assert.equal(r.items.find(x=>x.itemCode==='a:1').researchPriority,'review_negative_observed');
 assert.equal(r.items.find(x=>x.itemCode==='a:1').confirmedNetYen,-495);
});
test('item-level data does not claim post attribution',()=>{
 const r=prioritizeEditorialResearch({candidates:c,records:[record()]});
 assert.match(r.items[0].attribution,/no_post_attribution/);
 assert.equal(r.items[0].publishApproved,false);
});
test('invalid input rejected',()=>{
 assert.throws(()=>prioritizeEditorialResearch({records:{}}),/invalid_research_inputs/);
 assert.throws(()=>prioritizeEditorialResearch({minClicks:0}),/invalid_min_clicks/);
});
