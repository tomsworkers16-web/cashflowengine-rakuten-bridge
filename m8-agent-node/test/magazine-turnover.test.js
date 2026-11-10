import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
test('turnover and reward candidates may differ within the same lane',async()=>{
 const r=await discoverRevenueOpportunity('2026-11-11','19:30',{search:async keyword=>[
 {itemCode:'shop:cheap',itemName:keyword,price:1980,affiliateUrl:'https://example.com/a',reviewCount:100,reviewAverage:4.5,affiliateRate:3},
 {itemCode:'shop:costly',itemName:keyword,price:23900,affiliateUrl:'https://example.com/b',reviewCount:100,reviewAverage:4.5,affiliateRate:3}
 ]});
 assert.equal(r.strategyCandidates.rewardOriented.product.itemCode,'shop:costly');
 assert.equal(r.strategyCandidates.turnoverOriented.product.itemCode,'shop:cheap');
 assert.equal(r.publicationAllowed,false);
});
