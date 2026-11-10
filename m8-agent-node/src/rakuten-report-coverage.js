// Explain gaps in source-reported daily Rakuten metrics without replacing missing days with zeros.
// Does not initiate exports, reopen browser sessions, alter ledger or attribute sales to posts.
const KEYS=['clicks','salesCount','salesAmountYen','rewardYen'];
export function inspectRakutenReportCoverage(evidence){
 const daily=Array.isArray(evidence?.daily)?evidence.daily:[];
 const missingDates=daily.filter(x=>x.reported!==true).map(x=>x.date);
 const byMetric=Object.fromEntries(KEYS.map(metric=>[metric,{
  missingDates:daily.filter(x=>typeof x[metric]!=='number'||!Number.isFinite(x[metric])).map(x=>x.date),
  daysMeasured:daily.filter(x=>typeof x[metric]==='number'&&Number.isFinite(x[metric])).length
 }]));
 const recent=daily.at(-1);
 const latestReported=[...daily].reverse().find(x=>x.reported===true)?.date??null;
 return {
  status:daily.length===0?'not_evaluated':missingDates.length?'incomplete':'all_days_reported',
  interval:{from:evidence?.from??null,to:evidence?.to??null,days:daily.length},
  missingDates,latestReportedDay:latestReported,
  mostRecentDayReported:recent?.reported===true,
  metrics:byMetric,
  automaticCsvRedownloadRecommended:false,
  nextAction:missingDates.length?
   'Review future Rakuten UI daily snapshots for late-arriving rows; do not treat missing dates as zero or retry invalid CSV exports.':
   'Coverage observed for all dates; verify metric completeness and reporting status before profit claims.',
  caveat:'Source report coverage only. Missing dates may reflect report lag, unavailable data or capture gaps, not necessarily lost transactions.'
 };
}
