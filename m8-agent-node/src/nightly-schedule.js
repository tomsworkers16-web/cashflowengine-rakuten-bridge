// Daily automatic read-only evaluation schedule; no credentials, posting, or .env modifications.
export function nightlyWindow(nowMs, {hour=23,minute=45}={}) {
  const jst=new Date(nowMs+9*3600000);
  const day=jst.toISOString().slice(0,10);
  const minutes=jst.getUTCHours()*60+jst.getUTCMinutes();
  return {jstDay:day,due:minutes>=hour*60+minute};
}
export function shouldRunNightly({nowMs,lastCompletedDay,lastAttemptDay}){
 const clock=nightlyWindow(nowMs);
 return clock.due && clock.jstDay!==lastCompletedDay && clock.jstDay!==lastAttemptDay;
}
export function decideRevenueActions(report) {
 const affiliate=report?.affiliateResults||{};
 const posts=Number(report?.actuals?.posts||0);
 const caveats=[];
 if(affiliate.dataStatus==='not_reported'||!affiliate.dataStatus)
  caveats.push('楽天成果データが未取得のため、成約率・収益性の判断は保留');
 if(affiliate.rewardStatus!=='confirmed')
  caveats.push('確定報酬の証拠がないため、実利益による判断は保留');
 if(posts<1)caveats.push('当日の投稿実績がないため、投稿別評価は保留');
 if(!Array.isArray(report?.threadsInsights?.posts)||
     !report.threadsInsights.posts.some(p=>Number.isFinite(p.metrics?.views)))
  caveats.push('投稿ごとの表示数が未取得のため、投稿形式の優劣判定は保留');
 return {
  stage:caveats.length?'collect_evidence':'review_manual_evidence',
  automaticallyChangePublishing:false,
  automaticallyChangeProductSelection:false,
  recommendations:caveats.length?caveats:[
   '投稿実績と楽天確定報酬が揃ったため、同一期間の比較を実施',
   '成果と投稿の個別紐付けが確認されるまでは商品ごとの収益率を断定しない'
  ],
  alert:caveats.length>0
 };
}
