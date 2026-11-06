// Read-only 7-day Rakuten evidence summary; not proof of Threads attribution.
import {summarizeAffiliateDay} from './revenue-metrics.js';

export function summarizeRecentAffiliateEvidence(document, targetDay, days=7){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDay))throw Error('invalid_target_day');
 if(!Number.isInteger(days)||days<1||days>31)throw Error('invalid_window_days');
 const start=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(start))throw Error('invalid_target_day');
 const daily=[];
 for(let i=days-1;i>=0;i--){
  const date=new Date(start-i*86400000+9*3600000).toISOString().slice(0,10);
  const a=summarizeAffiliateDay(document,date);
  daily.push({date,reported:a.dataStatus!=='not_reported',
   clicks:a.clicks,orders:a.orders,salesCount:a.salesCount,
   salesAmountYen:a.salesAmountYen,rewardYen:a.rewardYen,
   rewardStatus:a.rewardStatus,profitYen:a.profitYen});
 }
 const aggregate=(key)=>{
  const values=daily.map(x=>x[key]).filter(Number.isFinite);
  return values.length?values.reduce((a,b)=>a+b,0):'unknown';
 };
 const reported=daily.filter(x=>x.reported);
 const commissionDays=daily.filter(x=>Number.isFinite(x.rewardYen)&&x.rewardYen>0);
 const profitComplete=daily.every(x=>x.reported&&Number.isFinite(x.profitYen));
 return {
  windowDays:days,from:daily[0].date,to:targetDay,
  daysReported:reported.length,daysMissing:days-reported.length,
  rakutenClicksReported:aggregate('clicks'),
  rakutenSalesCountReported:aggregate('salesCount'),
  rakutenSalesAmountYenReported:aggregate('salesAmountYen'),
  rakutenRewardYenReported:aggregate('rewardYen'),
  rewardEvidenceStatus:commissionDays.length?
    (commissionDays.every(x=>x.rewardStatus==='confirmed')?'confirmed_positive':'provisional_or_unconfirmed_positive'):
    (daily.some(x=>x.rewardYen==='unknown')?'incomplete':'no_positive_in_reported_days'),
  firstReportedCommissionDay:commissionDays[0]?.date||null,
  confirmedNetProfitYen:profitComplete?daily.reduce((sum,x)=>sum+x.profitYen,0):'unknown',
  daily,
  caveat:'楽天の報告対象期間内で集計。未報告の日は0円として補完しません。Threads投稿別の成果帰属は不明です。'
 };
}
