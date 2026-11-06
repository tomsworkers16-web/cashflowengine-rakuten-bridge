// Offline first-commission diagnostic. Do not join Rakuten clicks to Threads
// posts: Rakuten's sitewide report does not provide per-post attribution.
export function diagnoseFirstCommission({affiliateResults,threadsInsights}={}){
 const a=affiliateResults||{};
 const account=threadsInsights?.account||{};
 const views=Number.isFinite(account.metrics?.views)?account.metrics.views:null;
 const clicks=Number.isFinite(a.clicks)?a.clicks:null;
 const sales=Number.isFinite(a.salesCount)?a.salesCount:null;
 const reward=Number.isFinite(a.rewardYen)?a.rewardYen:null;
 const confirmed=a.rewardStatus==='confirmed';
 let stage,priority,action;
 if(reward!==null&&reward>0&&confirmed){
  stage='commission_confirmed';priority='scale_carefully';
  action='確定報酬を確認。出稿数を増やす前に費用と利益を確認する。';
 }else if(reward!==null&&reward>0){
  stage='commission_provisional';priority='verify_commission';
  action='成果報酬が発生。確定状況を継続確認し、取消分を利益に含めない。';
 }else if(a.dataStatus!=='partial_or_reported'||clicks===null){
  stage='rakuten_measurement_missing';priority='restore_reporting';
  action='楽天レポート取得・取り込みを最優先で復旧し、クリックゼロと未取得を混同しない。';
 }else if(clicks===0){
  stage='no_rakuten_clicks';priority='improve_click_motivation';
  action='楽天側のクリックは0件。PR投稿の訴求・商品選定・リンクを点検する。';
 }else if(sales===null){
  stage='sales_measurement_missing';priority='verify_sales';
  action='クリックは報告されているが売上件数は未取得。成果レポートの列を確認する。';
 }else if(sales===0){
  stage='clicks_without_reported_sales';priority='improve_product_fit';
  action='楽天側のクリックはあるが売上件数は0件。商品と購入動機の一致を見直す。';
 }else if(reward===null){
  stage='sales_without_reward_measurement';priority='verify_commission';
  action='売上件数の報告はあるが報酬が未取得。報酬情報を確認する。';
 }else{
  stage='sales_without_commission';priority='verify_commission';
  action='売上件数はあるが成果報酬は0円。対象条件と反映時差を確認する。';
 }
 return {
  stage,priority,nextAction:action,
  threadsViews:views??'unknown',
  rakutenClicks:clicks??'unknown',
  rakutenSalesCount:sales??'unknown',
  rakutenRewardYen:reward??'unknown',
  rewardStatus:a.rewardStatus||'unknown',
  profitConfirmed:confirmed && Number.isFinite(a.profitYen),
  attribution:'Rakuten日別クリック・売上はThreads投稿別の実績ではありません。流入元の断定はできません。'
 };
}
