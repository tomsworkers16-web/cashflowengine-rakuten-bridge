import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRecentAffiliateEvidence} from '../src/rolling-revenue-evidence.js';

test('shows earlier provisional commission despite missing current Rakuten report',()=>{
 const ledger={records:[
  {source:'rakuten_csv_period_daily',recordId:'period:2026-11-04',jstDate:'2026-11-04',
   rewardStatus:'provisional',clicks:9,salesCount:1,salesAmountYen:2400,rewardYen:60},
  {source:'rakuten_csv_period_daily',recordId:'period:2026-11-05',jstDate:'2026-11-05',
   rewardStatus:'provisional',clicks:0,salesCount:0,salesAmountYen:0,rewardYen:0}
 ]};
 const result=summarizeRecentAffiliateEvidence(ledger,'2026-11-06');
 assert.equal(result.windowDays,7);
 assert.equal(result.daysReported,2);
 assert.equal(result.daysMissing,5);
 assert.equal(result.rakutenRewardYenReported,60);
 assert.equal(result.rakutenClicksReported,9);
 assert.equal(result.firstReportedCommissionDay,'2026-11-04');
 assert.equal(result.rewardEvidenceStatus,'provisional_or_unconfirmed_positive');
 assert.equal(result.confirmedNetProfitYen,'unknown');
 assert.equal(result.daily.at(-1).rewardYen,'unknown');
});

test('unknown days are never counted as zero, and total profit needs full evidence',()=>{
 const missing=summarizeRecentAffiliateEvidence(null,'2026-11-06',7);
 assert.equal(missing.daysReported,0);
 assert.equal(missing.rakutenRewardYenReported,'unknown');
 assert.equal(missing.rewardEvidenceStatus,'incomplete');
 const ledger={records:[{source:'rakuten_csv_period_daily',recordId:'period:2026-11-06',
  jstDate:'2026-11-06',rewardStatus:'confirmed',clicks:5,salesCount:2,
  rewardYen:100,costYen:20}]};
 const partial=summarizeRecentAffiliateEvidence(ledger,'2026-11-06',7);
 assert.equal(partial.rewardEvidenceStatus,'confirmed_positive');
 assert.equal(partial.confirmedNetProfitYen,'unknown');
 const one=summarizeRecentAffiliateEvidence(ledger,'2026-11-06',1);
 assert.equal(one.confirmedNetProfitYen,80);
});

test('separate metric coverage prevents partial zero from becoming full-period zero',()=>{
 const rows={records:[
  {jstDate:'2026-11-05',source:'rakuten_csv_period_daily',recordId:'period:2026-11-05',
   clicks:0,salesCount:0,rewardYen:0}
 ]};
 const partial=summarizeRecentAffiliateEvidence(rows,'2026-11-06',7);
 assert.equal(partial.rakutenClicksReported,0);
 assert.equal(partial.metricCoverage.clicks.daysMeasured,1);
 assert.equal(partial.metricCoverage.clicks.complete,false);
 assert.equal(partial.metricCoverage.salesCount.complete,false);
 const one=summarizeRecentAffiliateEvidence(rows,'2026-11-05',1);
 assert.equal(one.metricCoverage.clicks.complete,true);
});
test('reported daily record can still have a missing click column',()=>{
 const rows={records:[
  {jstDate:'2026-11-05',source:'rakuten_csv_period_daily',recordId:'period:2026-11-05',
   rewardYen:0,salesCount:0}
 ]};
 const report=summarizeRecentAffiliateEvidence(rows,'2026-11-05',1);
 assert.equal(report.daysReported,1);
 assert.equal(report.metricCoverage.clicks.daysMeasured,0);
 assert.equal(report.metricCoverage.clicks.complete,false);
 assert.equal(report.metricCoverage.rewardYen.complete,true);
});
