// Offline, source-labelled affiliate results. No estimates are converted to actual earnings.
// Input: {records:[{jstDate:"YYYY-MM-DD",source:"rakuten_dashboard",clicks:2,
//   orders:1,rewardYen:80,costYen:0,itemCode:"shop:123"}]}
// Optional metrics stay unknown unless at least one valid record for that day supplies them.
const METRICS = ['clicks','orders','rewardYen','costYen'];
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
function numeric(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null; }
export function summarizeAffiliateDay(document, jstDate) {
  const rows = Array.isArray(document?.records) ? document.records : [];
  const matched = rows.filter(r => r && r.jstDate === jstDate && dayRe.test(r.jstDate)
    && typeof r.source === 'string' && r.source.trim().length > 0);
  // Imports can overlap. A source-issued recordId is stable across downloads;
  // repeated snapshots with the same source + recordId must never inflate earnings.
  const seen = new Set();
  const records = [];
  let duplicateRecordsIgnored = 0;
  for (const row of matched) {
    const recordId = typeof row.recordId === 'string' ? row.recordId.trim() : '';
    const key = recordId ? row.source.trim() + '/' + recordId : null;
    if (key && seen.has(key)) { duplicateRecordsIgnored++; continue; }
    if (key) seen.add(key);
    records.push(row);
  }
  const values = {};
  for (const name of METRICS) {
    const present = records.map(r => numeric(r[name])).filter(v => v !== null);
    values[name] = present.length > 0 ? present.reduce((a,b)=>a+b,0) : 'unknown';
  }
  // If costs or earnings are not reported, zero may NOT be silently assumed.
  const profitYen = typeof values.rewardYen === 'number' && typeof values.costYen === 'number'
    ? values.rewardYen - values.costYen : 'unknown';
  const conversionRate = typeof values.orders === 'number' && typeof values.clicks === 'number' && values.clicks > 0
    ? values.orders / values.clicks : 'unknown';
  const details = records.filter(r => typeof r.itemCode === 'string' && /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(r.itemCode))
    .map(r => ({ itemCode:r.itemCode, source:r.source, clicks:numeric(r.clicks) ?? 'unknown',
      orders:numeric(r.orders) ?? 'unknown', rewardYen:numeric(r.rewardYen) ?? 'unknown' }));
  return { dataStatus: records.length ? 'partial_or_reported' : 'not_reported',
    reportSources:[...new Set(records.map(r=>r.source.trim()))], recordCount:records.length,
    duplicateRecordsIgnored,
    ...values, profitYen, conversionRate, byItemReported:details,
    caveat:'Affiliate data is source-reported; per-post attribution is unproven without tracking identifiers.' };
}
