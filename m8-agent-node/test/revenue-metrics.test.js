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
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'rakuten_dashboard',rewardStatus:'confirmed',clicks:0,orders:0,rewardYen:0,costYen:0}]},day);
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
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'rakuten_dashboard',rewardStatus:'confirmed',clicks:'20',orders:-1,rewardYen:70,costYen:10}]},day);
  assert.equal(v.clicks,'unknown');assert.equal(v.orders,'unknown');assert.equal(v.profitYen,60);
});

test('repeated imports with stable source record IDs are not double counted',()=>{
  const record={jstDate:day,source:'rakuten_dashboard',recordId:'order-101',clicks:1,orders:1,rewardYen:80,costYen:0};
  const v=summarizeAffiliateDay({records:[record,{...record}]},day);
  assert.equal(v.recordCount,1);
  assert.equal(v.duplicateRecordsIgnored,1);
  assert.equal(v.orders,1);
  assert.equal(v.rewardYen,80);
});

test('the same record ID from separate sources is not improperly collapsed',()=>{
  const record={jstDate:day,recordId:'report-1',orders:1,rewardYen:50,costYen:0};
  const v=summarizeAffiliateDay({records:[{...record,source:'rakuten_dashboard'},{...record,source:'another_provider'}]},day);
  assert.equal(v.orders,2);
  assert.equal(v.duplicateRecordsIgnored,0);
});

test('provisional report is never represented as realized net profit',()=>{
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'rakuten_csv_period_daily',rewardStatus:'provisional',rewardYen:250,costYen:40}]},day);
  assert.equal(v.rewardYen,250);
  assert.equal(v.rewardStatus,'provisional');
  assert.equal(v.profitYen,'unknown');
});
test('unspecified evidence status is not presumed confirmed',()=>{
  const v=summarizeAffiliateDay({records:[{jstDate:day,source:'unknown_source',rewardYen:20,costYen:0}]},day);
  assert.equal(v.rewardStatus,'unknown');
  assert.equal(v.profitYen,'unknown');
});

test('sales counts are distinct from order counts and are not equated to conversions',()=>{
 const v=summarizeAffiliateDay({records:[{
  jstDate:day,source:'rakuten_csv_period_daily',rewardStatus:'provisional',
  clicks:3,rewardYen:80,salesCount:1,salesAmountYen:1400
 }]},day);
 assert.equal(v.salesCount,1);
 assert.equal(v.salesAmountYen,1400);
 assert.equal(v.rewardYen,80);
 assert.equal(v.orders,'unknown');
 assert.equal(v.conversionRate,'unknown');
 assert.equal(v.profitYen,'unknown');
});
