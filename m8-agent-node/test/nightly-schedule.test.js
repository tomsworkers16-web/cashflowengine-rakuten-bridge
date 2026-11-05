import test from 'node:test';
import assert from 'node:assert/strict';
import {nightlyWindow,shouldRunNightly,decideRevenueActions} from '../src/nightly-schedule.js';

test('JST 23:45 is the daily reporting gate',()=>{
 const before=Date.parse('2026-11-05T14:44:00Z');
 const after=Date.parse('2026-11-05T14:45:00Z');
 assert.deepEqual(nightlyWindow(before),{jstDay:'2026-11-05',due:false});
 assert.deepEqual(nightlyWindow(after),{jstDay:'2026-11-05',due:true});
 assert.equal(shouldRunNightly({nowMs:after,lastAttemptDay:'2026-11-05'}),false);
 assert.equal(shouldRunNightly({nowMs:after,lastCompletedDay:'2026-11-05'}),false);
 assert.equal(shouldRunNightly({nowMs:after,lastAttemptDay:'2026-11-04'}),true);
});
test('unknown commissions and clicks never trigger revenue optimization',()=>{
 const d=decideRevenueActions({actuals:{posts:1},affiliateResults:{dataStatus:'not_reported',rewardStatus:'unknown'},threadsInsights:{posts:[]}});
 assert.equal(d.stage,'collect_evidence');
 assert.equal(d.automaticallyChangePublishing,false);
 assert.equal(d.automaticallyChangeProductSelection,false);
 assert.equal(d.alert,true);
 assert.match(d.recommendations.join(' '),/楽天/);
});
test('confirmed commissions do not imply per-post attribution',()=>{
 const d=decideRevenueActions({
  actuals:{posts:3},
  affiliateResults:{dataStatus:'partial_or_reported',rewardStatus:'confirmed'},
  threadsInsights:{posts:[{metrics:{views:100}}]}
 });
 assert.equal(d.stage,'review_manual_evidence');
 assert.equal(d.alert,false);
 assert.match(d.recommendations.join(' '),/紐付け/);
 assert.equal(d.automaticallyChangePublishing,false);
});
