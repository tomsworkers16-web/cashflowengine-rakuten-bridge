import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
test('all lanes scanned before choosing highest opportunity proxy',async()=>{
 const calls=[];
 const result=await discoverRevenueOpportunity('2026-11-11','19:30',{search:async keyword=>{
  calls.push(keyword);
  return [{itemCode:'shop:1',itemName:keyword,price:4000,affiliateUrl:'https://example.com/item',reviewCount:keyword.includes('水切り')?1000:1,reviewAverage:4.5,affiliateRate:3}];
 }});
 assert.equal(calls.length,3);
 assert.equal(result.selected.topicId,'kitchen-cleanup');
 assert.equal(result.selected.product.indicativeReward,120);
 assert.equal(result.publicationAllowed,false);
});
test('no candidate and rate limit do not produce a forced commercial plan',async()=>{
 const x=await discoverRevenueOpportunity('2026-11-11','19:30',{search:async()=>[]});
 assert.equal(x.selected,null);
 let calls=0;
 await assert.rejects(discoverRevenueOpportunity('2026-11-11','19:30',{search:async()=>{calls++;throw Error('rakuten_search_http_429');}}),/429/);
 assert.equal(calls,1);
});
