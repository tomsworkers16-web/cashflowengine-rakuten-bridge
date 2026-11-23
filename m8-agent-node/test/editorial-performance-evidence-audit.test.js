import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEditorialPerformanceEvidence as audit } from '../src/editorial-performance-evidence-audit.js';

const item = (changes = {}) => ({ source: 'reviewed_item_report', recordId: 'r1', itemCode: 'shop:1',
  clicks: 10, orders: 2, rewardYen: 100, costYen: 20, rewardStatus: 'confirmed', ...changes });

test('missing or malformed ledger is not zero performance', () => {
  assert.equal(audit(null).status, 'ledger_unavailable_or_invalid');
  assert.equal(audit({ records: {} }).status, 'ledger_unavailable_or_invalid');
});
test('daily CSV and UI aggregations never qualify as item evidence', () => {
  const r = audit({ records: [item({ source: 'rakuten_csv_period_daily' }), item({ source: 'rakuten_ui_period_daily' })] });
  assert.equal(r.aggregateOnly, 2);
  assert.equal(r.eligibleRows, 0);
});
test('valid item evidence reports only counts, never raw IDs or money', () => {
  const r = audit({ records: [item()] });
  assert.equal(r.eligibleRows, 1);
  assert.equal(r.published, 0);
  assert.equal(JSON.stringify(r).includes('shop:1'), false);
  assert.equal(JSON.stringify(r).includes('reviewed_item_report'), false);
});
test('missing costs or provisional rewards never qualify', () => {
  const r = audit({ records: [item({ costYen: null }), item({ recordId: 'r2', rewardStatus: 'provisional' })] });
  assert.equal(r.incompleteMetrics, 1);
  assert.equal(r.missingMetrics.costYen, 1);
  assert.equal(r.unconfirmedReward, 1);
  assert.equal(r.eligibleRows, 0);
});
test('identical repeated rows count once', () => {
  const r = audit({ records: [item(), item()] });
  assert.equal(r.eligibleRows, 1);
  assert.equal(r.repeatedRows, 1);
});
test('conflicting repeated record IDs are excluded entirely', () => {
  const r = audit({ records: [item(), item({ rewardYen: 900 })] });
  assert.equal(r.eligibleRows, 0);
  assert.equal(r.conflictingRecordIds, 1);
});
test('malformed rows, absent item identity and absent record ID are distinct', () => {
  const r = audit({ records: [null, item({ itemCode: '' }), item({ recordId: '' })] });
  assert.equal(r.malformed, 1);
  assert.equal(r.missingItemCode, 1);
  assert.equal(r.missingSourceOrRecordId, 1);
  assert.equal(r.eligibleRows, 0);
});
test('actual numeric zero is present, invalid numbers are not', () => {
  const r = audit({ records: [item({ costYen: 0 }), item({ recordId: 'r2', clicks: -1 })] });
  assert.equal(r.eligibleRows, 1);
  assert.equal(r.missingMetrics.clicks, 1);
});
