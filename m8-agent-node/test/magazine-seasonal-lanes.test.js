import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonalMagazineIssues} from '../src/magazine-seasonal-lanes.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
test('calendar adds two hypotheses per season, not demand claims',()=>{
 for(const day of ['2026-11-11','2027-04-01','2027-07-01']){
  const issues=seasonalMagazineIssues(day,'19:30');
  assert.equal(issues.length,2);
  assert.ok(issues.every(x=>x.evidence==='calendar_hypothesis_not_observed_demand'));
 }
});
test('seasonal search precedes ranking; unrelated products excluded',async()=>{
 const calls=[];
 const result=await discoverRevenueOpportunity('2026-11-11','19:30',{includeSeasonal:true,search:async keyword=>{
  calls.push(keyword);
  if(!keyword.includes('電気毛布'))return [];
  return [{itemCode:'shop:1',itemName:'電気毛布',price:5000,affiliateUrl:'https://example.com/item',reviewCount:100,reviewAverage:4.5,affiliateRate:3},
   {itemCode:'shop:2',itemName:'タオル',price:9999,affiliateUrl:'https://example.com/other',reviewCount:9999}];
 }});
 assert.equal(calls.length,5);
 assert.equal(result.selected.topicId,'winter-warmth');
 assert.equal(result.selected.candidateCount,1);
 assert.equal(result.publicationAllowed,false);
});
