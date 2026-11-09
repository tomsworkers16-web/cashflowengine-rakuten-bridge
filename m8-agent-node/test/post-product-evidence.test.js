import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePostProductEvidence} from '../src/post-product-evidence.js';

const published=(day,slot,id,code,status='verified_posted')=>({jstDate:day,slot,id,meta:{role:'revenue',itemCode:code,publishStatus:status}});
test('repeated journal slot transitions count only final published state',()=>{
 const result=evaluatePostProductEvidence({
  targetDay:'2026-11-10',
  posts:[
   {jstDate:'2026-11-09',slot:'12:30',id:null,meta:{role:'revenue',publishStatus:'pending'}},
   published('2026-11-09','12:30','threadA','shop:123'),
   {jstDate:'2026-11-09',slot:'19:30',id:null,meta:{role:'revenue',publishStatus:'unverified'}},
   published('2026-11-10','12:30','threadB','other:456')
  ],
  insights:[{id:'threadA',metrics:{views:12}},{id:'threadA',metrics:{views:16}}],
  ledger:{records:[{jstDate:'2026-11-09',source:'rakuten_dashboard',clicks:3,orders:1,rewardYen:100}]}
 });
 assert.equal(result.publishedAffiliatePosts,2);
 assert.equal(result.publishedAffiliatePostsWithObservedViews,1);
 assert.equal(result.observedLifetimeViewsSum,16);
 assert.equal(result.uncertainPostAttempts,1);
 assert.equal(result.affiliateReportDaysPresent,1);
 assert.equal(result.perPostRevenueAttribution,'unavailable');
 assert.equal(result.clickThroughRate,'unknown');
 assert.equal(result.confirmedPostProfitYen,'unknown');
});
test('item-code overlap is a match, never inferred conversion credit',()=>{
 const x=evaluatePostProductEvidence({
  targetDay:'2026-11-10',posts:[published('2026-11-10','12:30','threadC','shop:123')],
  insights:[{id:'threadC',metrics:{views:0}}],
  ledger:{records:[{jstDate:'2026-11-10',source:'rakuten_dashboard',itemCode:'shop:123',orders:2,rewardYen:150,rewardStatus:'confirmed'}]}
 });
 assert.deepEqual(x.itemCodesAlsoInAffiliateRecords,['shop:123']);
 assert.equal(x.posts[0].views,0);
 assert.equal(x.perPostRevenueAttribution,'unavailable');
 assert.equal(x.confirmedPostProfitYen,'unknown');
});
test('missing local evidence remains unknown, never zero',()=>{
 const x=evaluatePostProductEvidence({targetDay:'2026-11-10'});
 assert.equal(x.publishedAffiliatePosts,0);
 assert.equal(x.observedLifetimeViewsSum,'unknown');
 assert.equal(x.affiliateReportDaysPresent,0);
 assert.equal(x.clickThroughRate,'unknown');
 assert.throws(()=>evaluatePostProductEvidence({targetDay:'invalid'}),/invalid_evidence_window/);
});
