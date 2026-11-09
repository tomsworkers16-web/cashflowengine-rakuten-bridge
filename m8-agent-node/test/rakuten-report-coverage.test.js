import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRakutenReportCoverage} from '../src/rakuten-report-coverage.js';
import {summarizeRecentAffiliateEvidence} from '../src/rolling-revenue-evidence.js';
test('missing dates are explicit, cannot be misreported as zero or trigger broken CSV',()=>{
 const r=summarizeRecentAffiliateEvidence({records:[
  {jstDate:'2026-11-06',source:'rakuten_ui_period_daily',clicks:0,salesCount:0,rewardYen:0,salesAmountYen:0}
 ]},'2026-11-08',3);
 const x=inspectRakutenReportCoverage(r);
 assert.equal(x.status,'incomplete');
 assert.deepEqual(x.missingDates,['2026-11-07','2026-11-08']);
 assert.equal(x.latestReportedDay,'2026-11-06');
 assert.equal(x.mostRecentDayReported,false);
 assert.deepEqual(x.metrics.clicks.missingDates,['2026-11-07','2026-11-08']);
 assert.equal(x.automaticCsvRedownloadRecommended,false);
});
test('reported day may still omit specific metrics',()=>{
 const r=summarizeRecentAffiliateEvidence({records:[
  {jstDate:'2026-11-08',source:'rakuten_ui_period_daily',clicks:0}
 ]},'2026-11-08',1);
 const x=inspectRakutenReportCoverage(r);
 assert.equal(x.status,'all_days_reported');
 assert.equal(x.metrics.clicks.daysMeasured,1);
 assert.deepEqual(x.metrics.rewardYen.missingDates,['2026-11-08']);
});
test('empty evidence does not invent complete coverage',()=>{
 const x=inspectRakutenReportCoverage({});
 assert.equal(x.status,'not_evaluated');
 assert.deepEqual(x.missingDates,[]);
 assert.equal(x.latestReportedDay,null);
});
