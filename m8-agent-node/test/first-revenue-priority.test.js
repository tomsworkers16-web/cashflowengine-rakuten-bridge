import test from 'node:test';
import assert from 'node:assert/strict';
import {firstRevenuePriority} from '../src/first-revenue-priority.js';

const make=(opts={})=>({
 exposure:{affiliatePosts:3,affiliatePostsWithViews:3,affiliatePostLifetimeViewsObserved:400,...opts.exposure},
 sevenDay:{daysReported:7,rakutenClicks:0,rakutenSalesCount:0,provisionalOrConfirmedRewardYen:0,...opts.sevenDay},
 captureConsistency:opts.captureConsistency||'not_verified'
});
test('missing reward measurement is never interpreted as zero commission',()=>{
 const x=firstRevenuePriority(make({sevenDay:{daysReported:0,rakutenClicks:'unknown',provisionalOrConfirmedRewardYen:'unknown'}}));
 assert.equal(x.stage,'rakuten_clicks_unknown');
 assert.equal(x.profitConfirmed,false);
 assert.equal(x.affiliateClickAttribution,'unknown');
});
test('observed low reach is prioritized before click claims when exposure is sparse',()=>{
 const x=firstRevenuePriority(make({exposure:{affiliatePostLifetimeViewsObserved:11,affiliatePostsWithViews:1},
 sevenDay:{daysReported:0,rakutenClicks:'unknown'}}));
 assert.equal(x.stage,'low_observed_exposure');
 assert.equal(x.automaticPublishingChange,false);
});
test('zero actual affiliate posts and unmeasured posts differ',()=>{
 assert.equal(firstRevenuePriority(make({exposure:{affiliatePosts:0,affiliatePostsWithViews:0,affiliatePostLifetimeViewsObserved:'unknown'}})).stage,'no_affiliate_posts');
 assert.equal(firstRevenuePriority(make({exposure:{affiliatePostsWithViews:0,affiliatePostLifetimeViewsObserved:'unknown'}})).stage,'post_exposure_unknown');
});
test('known Rakuten click count and conversion funnel give bounded actions',()=>{
 assert.equal(firstRevenuePriority(make()).stage,'no_reported_rakuten_clicks');
 assert.equal(firstRevenuePriority(make({sevenDay:{rakutenClicks:4,rakutenSalesCount:0}})).stage,'clicks_without_sales');
 assert.equal(firstRevenuePriority(make({sevenDay:{rakutenClicks:4,rakutenSalesCount:'unknown'}})).stage,'sales_unknown');
 assert.equal(firstRevenuePriority(make({sevenDay:{rakutenClicks:4,rakutenSalesCount:1,provisionalOrConfirmedRewardYen:0}})).stage,'sales_without_reported_commission');
});
test('positive reported reward requires confirmation and cannot be profit',()=>{
 const x=firstRevenuePriority(make({sevenDay:{provisionalOrConfirmedRewardYen:20}}));
 assert.equal(x.stage,'reported_commission');
 assert.equal(x.profitConfirmed,false);
 assert.equal(x.automaticBudgetChange,false);
});
test('verified page and broken download changes remediation priority',()=>{
 const x=firstRevenuePriority(make({sevenDay:{daysReported:0,rakutenClicks:'unknown'},captureConsistency:'ui_has_dates_but_export_has_invalid_dates'}));
 assert.equal(x.priority,'repair_export_mismatch');
});
