import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseFirstCommission} from '../src/first-commission-funnel.js';

const info=(affiliateResults,views)=>diagnoseFirstCommission({
 affiliateResults,threadsInsights:{account:{metrics:{views}}}
});

test('missing Rakuten data is unknown, never zero click evidence',()=>{
 const x=info({dataStatus:'not_reported',clicks:'unknown',rewardYen:'unknown'},400);
 assert.equal(x.stage,'rakuten_measurement_missing');
 assert.equal(x.rakutenClicks,'unknown');
 assert.equal(x.threadsViews,'unknown');
 assert.equal(x.accountViewsMetric,400);
 assert.match(x.attribution,/Threads投稿別/);
});

test('zero sitewide clicks and clicks without sales are distinguishable',()=>{
 const zero=info({dataStatus:'partial_or_reported',clicks:0,salesCount:0,rewardYen:0},300);
 assert.equal(zero.stage,'no_rakuten_clicks');
 const clicked=info({dataStatus:'partial_or_reported',clicks:12,salesCount:0,rewardYen:0},300);
 assert.equal(clicked.stage,'clicks_without_reported_sales');
 assert.equal(clicked.profitConfirmed,false);
});

test('positive provisional reward is not confirmed profit',()=>{
 const x=info({dataStatus:'partial_or_reported',clicks:15,salesCount:2,rewardYen:100,
  rewardStatus:'provisional',profitYen:'unknown'},1000);
 assert.equal(x.stage,'commission_provisional');
 assert.equal(x.profitConfirmed,false);
});

test('confirmed commission can be recognized without inventing net profit',()=>{
 const x=info({dataStatus:'partial_or_reported',clicks:15,salesCount:2,rewardYen:100,
  rewardStatus:'confirmed',profitYen:'unknown'},1000);
 assert.equal(x.stage,'commission_confirmed');
 assert.equal(x.profitConfirmed,false);
 const p=info({dataStatus:'partial_or_reported',clicks:15,salesCount:2,rewardYen:100,
  rewardStatus:'confirmed',profitYen:90},1000);
 assert.equal(p.profitConfirmed,true);
});
