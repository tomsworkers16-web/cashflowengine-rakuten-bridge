import test from 'node:test';
import assert from 'node:assert/strict';
import {planEditorialReviewQueue} from '../src/editorial-queue-planner.js';
const ready=(code)=>({
 itemCode:code,status:'review_candidate',article:'根拠付きの記事本文'.repeat(25),
 productConditionsVerified:true,variantResolved:true,affiliateComplianceVerified:true,
 ownerApproved:true,destinationVerified:true
});
test('unapproved real-world editorial drafts cannot be queued',()=>{
 const q=planEditorialReviewQueue({
  items:[
    {itemCode:'kitchenavi:10000408',status:'editorial_review_draft',
      article:'購入前の注意点'.repeat(35),variantResolved:false},
    {itemCode:'e-kurashi:10048736',status:'review_candidate',
      article:'収納チェック'.repeat(40),ownerApproved:false}
  ],now:'2026-11-20'
 });
 assert.equal(q.summary.proposed,0);
 assert.equal(q.summary.held,2);
 assert.equal(q.summary.published,0);
 assert.ok(q.held[0].blockingReasons.includes('variant_unresolved'));
 assert.ok(q.held[1].blockingReasons.includes('owner_approval_missing'));
});
test('even approved and verified input becomes proposal only, never scheduled',()=>{
 const q=planEditorialReviewQueue({items:[ready('sample:001')],now:'2026-11-20'});
 assert.equal(q.summary.proposed,1);
 assert.equal(q.proposed[0].status,'schedule_proposal_only');
 assert.equal(q.proposed[0].publishApproved,false);
 assert.equal(q.summary.published,0);
 assert.equal(q.automaticallyPublish,false);
 assert.equal(q.requiresManualScheduling,true);
});
test('duplicate content and capacity are bounded',()=>{
 const items=[ready('sample:001'),ready('sample:001'),ready('sample:002')];
 const q=planEditorialReviewQueue({items,max:1,now:'2026-11-20'});
 assert.equal(q.summary.proposed,1);
 assert.equal(q.held.length,2);
 assert.ok(q.held.some(x=>x.reason==='duplicate_item'));
 assert.ok(q.held.some(x=>x.reason==='queue_capacity_exceeded'));
});
test('invalid planning request fails closed',()=>{
 assert.throws(()=>planEditorialReviewQueue({items:{}}),/editorial_items_required/);
 assert.throws(()=>planEditorialReviewQueue({now:'tomorrow'}),/invalid_plan_date/);
 assert.throws(()=>planEditorialReviewQueue({max:0}),/invalid_plan_limit/);
});
