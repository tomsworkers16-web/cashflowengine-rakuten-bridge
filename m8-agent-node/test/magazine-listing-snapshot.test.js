import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch,replayListingSearch,asciiJson} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
test('complete normalized snapshot reproduces both candidate strategies with no network',async()=>{
 const day='2026-11-11',calls=[];
 const capture=captureListingSearch(async keyword=>{
  calls.push(keyword);
  return [{itemCode:'shop:1',itemName:keyword,price:1980,affiliateUrl:'https://example.com/item',reviewCount:100,reviewAverage:4.5,affiliateRate:3,accessKey:'must-not-be-captured'}];
 },{day});
 const first=await discoverRevenueOpportunity(day,'19:30',{search:capture.search,includeSeasonal:true});
 const snap=capture.snapshot();
 assert.equal(calls.length,5);
 assert.ok(!JSON.stringify(snap).includes('must-not-be-captured'));
 const second=await discoverRevenueOpportunity(day,'19:30',{search:replayListingSearch(snap,{day}),includeSeasonal:true});
 assert.deepEqual(second,first);
 assert.equal(calls.length,5);
 assert.throws(()=>replayListingSearch(snap,{day:'2026-11-12'}),/snapshot_invalid/);
 await assert.rejects(replayListingSearch(snap,{day})('unknown'),/snapshot_missing_keyword/);
});
test('ASCII JSON round trips Japanese and emoji without changing content',()=>{
 const data={title:'水切りラック、使いやすい？',text:'暮らし😊\n引用「道具」'};
 const encoded=asciiJson(data);
 assert.ok(/^[\x00-\x7e]*$/.test(encoded));
 assert.deepEqual(JSON.parse(encoded),data);
});
