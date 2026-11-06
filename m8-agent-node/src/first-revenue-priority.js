// First-commission prioritization using only measured evidence.
// No automatic spending, posting or claiming attributable earnings.
export function firstRevenuePriority({exposure={},sevenDay={},captureConsistency='not_verified'}={}){
 const posts=exposure.affiliatePosts;
 const measured=exposure.affiliatePostsWithViews;
 const views=exposure.affiliatePostLifetimeViewsObserved;
 const clicks=sevenDay.rakutenClicks;
 const sales=sevenDay.rakutenSalesCount;
 const reward=sevenDay.provisionalOrConfirmedRewardYen;
 const daysReported=sevenDay.daysReported;
 const base={automaticPublishingChange:false,automaticBudgetChange:false,
  affiliateClickAttribution:'unknown',profitConfirmed:false};
 if(Number.isFinite(reward)&&reward>0)return {...base,
  stage:'reported_commission',priority:'verify_reward_and_costs',
  why:'楽天の日別レポートに報酬が記録されています。確定報酬や利益とは限りません。'};
 if(posts===0)return {...base,stage:'no_affiliate_posts',
  priority:'verify_revenue_slot_publishing',
  why:'直近7日間に確認できた収益投稿がありません。投稿処理の状況を点検します。'};
 if(!Number.isInteger(posts)||!Number.isInteger(measured)||measured===0
   ||!Number.isFinite(views))return {...base,stage:'post_exposure_unknown',
  priority:'restore_post_insights',why:'収益投稿の表示実績が未取得です。閲覧0回とは断定できません。'};
 // Low observed exposure is a hypothesis, not proof of poor distribution.
 if(views<100)return {...base,stage:'low_observed_exposure',
  priority:'improve_distribution_and_hooks',
  why:'計測できた直近7日間の収益投稿表示数が合計100回未満です。露出と導入文を優先検証します。'};
 if(!Number.isInteger(daysReported)||daysReported===0||!Number.isFinite(clicks))
  return {...base,stage:'rakuten_clicks_unknown',
   priority:captureConsistency==='ui_has_dates_but_export_has_invalid_dates'
    ?'repair_export_mismatch':'restore_rakuten_reporting',
   why:'楽天の有効なクリック実績が未取得です。0クリックとは扱いません。'};
 if(clicks===0)return {...base,stage:'no_reported_rakuten_clicks',
  priority:'inspect_link_and_offer',why:'楽天の報告済み期間でクリック0件。投稿とリンクのクリック動機を見直します。'};
 if(!Number.isFinite(sales))return {...base,stage:'sales_unknown',
  priority:'restore_sales_reporting',why:'クリックは記録されていますが売上件数が未取得です。'};
 if(sales===0)return {...base,stage:'clicks_without_sales',
  priority:'improve_product_fit',why:'楽天にクリックが記録されていますが、報告済みの売上件数は0件です。'};
 return {...base,stage:'sales_without_reported_commission',
  priority:'verify_reward_reporting',why:'売上件数が記録されています。報酬の反映状況を確認します。'};
}
