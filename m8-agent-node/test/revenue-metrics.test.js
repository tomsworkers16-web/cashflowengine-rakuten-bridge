import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAffiliateDay } from '../src/revenue-metrics.js';

const day='2026-11-05';
test('missing evidence is unknown, not zero earnings',()=>{
  const v=summarizeAffiliateDay(null,day);
  assert.equal(v.dataStatus,'not_reported');
  assert.equal(v.orders,'unknown');
  assert.equal(v.rewardYen,'unknown');
  assert.equal(v.profitYen,'unknown');
});
test('zero is valid only if explicitly supplied',()=>{
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'rakuten_dashboard',clicks:0,orders:0,rewardYen:0,costYen:0}]},day);
  assert.equal(v.rewardYen,0);assert.equal(v.profitYen,0);assert.equal(v.conversionRate,'unknown');
});
test('daily aggregation excludes other dates and preserves missing costs',()=>{
  const v=summarizeAffiliateDay({records:[
    {jstDate:day,source:'rakuten_dashboard',clicks:10,orders:1,rewardYen:80,itemCode:'shop:123'},
    {jstDate:'2026-11-04',source:'rakuten_dashboard',clicks:20,orders:3,rewardYen:240,costYen:0},
  ]},day);
  assert.equal(v.clicks,10);assert.equal(v.orders,1);assert.equal(v.rewardYen,80);
  assert.equal(v.profitYen,'unknown');assert.equal(v.conversionRate,0.1);
  assert.equal(v.byItemReported[0].itemCode,'shop:123');
});
test('rejects negative and stringified amounts instead of fabricating metrics',()=>{
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'rakuten_dashboard',clicks:'20',orders:-1,rewardYen:70,costYen:10}]},day);
  assert.equal(v.clicks,'unknown');assert.equal(v.orders,'unknown');assert.equal(v.profitYen,60);
});
