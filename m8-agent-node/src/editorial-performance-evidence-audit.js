// Read-only schema audit. Never derives item-level results from account/day totals.
const aggregateSources = new Set(['rakuten_csv_period_daily', 'rakuten_ui_period_daily']);
const itemCodePattern = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;
const metricNames = ['clicks', 'orders', 'rewardYen', 'costYen'];
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const present = value => typeof value === 'string' && value.trim().length > 0;

export function inspectEditorialPerformanceEvidence(document) {
  if (!document || !Array.isArray(document.records)) {
    return { audit: { status: 'ledger_unavailable_or_invalid', rows: 0, eligibleRows: 0, published: 0 }, eligible: [], blocked: new Map() };
  }
  const counts = { aggregateOnly: 0, malformed: 0, missingItemCode: 0,
    missingSourceOrRecordId: 0, incompleteMetrics: 0, unconfirmedReward: 0,
    repeatedRows: 0, conflictingRecordIds: 0, eligibleRows: 0 };
  const missingMetrics = Object.fromEntries(metricNames.map(name => [name, 0]));
  const records = new Map();
  const eligible = [], blocked = new Map();
  const block = (code, reason) => {
    if (!present(code) || !itemCodePattern.test(code)) return;
    const reasons = blocked.get(code) || new Set();
    reasons.add(reason); blocked.set(code, reasons);
  };
  for (const row of document.records) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { counts.malformed++; continue; }
    // Known daily aggregations are never item-level evidence, even if a code was attached downstream.
    if (present(row.source) && aggregateSources.has(row.source.trim())) { counts.aggregateOnly++; continue; }
    const validItem = present(row.itemCode) && itemCodePattern.test(row.itemCode);
    if (!validItem) counts.missingItemCode++;
    if (!present(row.source) || !present(row.recordId)) { if(validItem) counts.missingSourceOrRecordId++; block(row.itemCode, 'data_insufficient'); continue; }
    const key = JSON.stringify([row.source.trim(), row.recordId.trim()]);
    const signature = JSON.stringify([row.itemCode, row.rewardStatus, ...metricNames.map(name => row[name])]);
    if (records.has(key)) {
      const previous = records.get(key);
      counts.repeatedRows++;
      if (previous.signature !== signature) { previous.conflict = true; block(previous.row.itemCode, 'conflicting_evidence'); block(row.itemCode, 'conflicting_evidence'); }
      continue;
    }
    records.set(key, { row, signature, conflict: false, validItem });
  }
  for (const { row, conflict, validItem } of records.values()) {
    if (conflict) { counts.conflictingRecordIds++; continue; }
    if (!validItem) continue;
    const missing = metricNames.filter(name => !nonnegativeInteger(row[name]));
    if (missing.length) {
      counts.incompleteMetrics++;
      block(row.itemCode, 'data_insufficient');
      for (const name of missing) missingMetrics[name]++;
    }
    if (row.rewardStatus !== 'confirmed') { counts.unconfirmedReward++; block(row.itemCode, 'reward_unconfirmed'); }
    if (!missing.length && row.rewardStatus === 'confirmed') { counts.eligibleRows++; eligible.push(row); }
  }
  const audit = { mode: 'read_only_schema_audit', status: counts.eligibleRows ? 'item_evidence_schema_present' : 'item_evidence_insufficient',
    rows: document.records.length, ...counts, missingMetrics,
    caveat: 'Schema completeness is not independent proof of attribution, source accuracy, or actual profit.',
    published: 0 };
  return { audit, eligible, blocked };
}

export function auditEditorialPerformanceEvidence(document) {
  return inspectEditorialPerformanceEvidence(document).audit;
}
