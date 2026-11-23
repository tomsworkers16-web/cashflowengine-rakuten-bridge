import test from 'node:test';
import assert from 'node:assert/strict';
import {createFusionTrialPlan} from '../src/magazine-fusion-trial-plan.js';
const packet={status:'creatives_ready_for_review',publicationAllowed:false,productItemCode:'shop:1',arms:[
 {arm:'baseline',topicId:'kitchen-cleanup',itemCode:'shop:1',draft:{status:'manual_review_required',text:'【PR】first'}},
 {arm:'fusion',topicId:'kitchen-cleanup',itemCode:'shop:1',draft:{status:'manual_review_required',text:'【PR】second'}}
]};
test('plans equal A/B counts without publishing and excludes occupied slots',()=>{
 const plan=createFusionTrialPlan(packet,{startDay:'2026-11-14',slot:'19:30',pairs:3,occupiedSlots:[{jstDate:'2026-11-14',slot:'19:30'},{jstDate:'2026-11-15',slot:'07:30'}]});
 assert.equal(plan.status,'plan_ready_for_owner_review');
 assert.deepEqual(plan.armCounts,{baseline:3,fusion:3});
 assert.equal(plan.entries[0].jstDate,'2026-11-15');
 assert.deepEqual(plan.entries.map(x=>x.arm),['baseline','fusion','fusion','baseline','baseline','fusion']);
 assert.ok(plan.entries.every(x=>x.approvalStatus==='owner_approval_required'&&x.postId===null&&x.publishStatus==='not_published'));
 assert.equal(plan.publicationAllowed,false);assert.equal(plan.autoScheduleChanged,false);
});
test('fails closed when creative incomplete or scheduling occupied',()=>{
 assert.equal(createFusionTrialPlan({...packet,arms:[packet.arms[0]]},{startDay:'2026-11-14'}).status,'creative_packet_not_ready');
 assert.equal(createFusionTrialPlan(packet,{startDay:'2026-11-14',pairs:2,dayLimit:2}).status,'insufficient_free_slots');
 assert.throws(()=>createFusionTrialPlan(packet,{startDay:'2026-02-30'}),/invalid_plan_date/);
 assert.throws(()=>createFusionTrialPlan(packet,{startDay:'2026-11-14',occupiedSlots:[{jstDate:'2026-11-14',slot:'bad'}]}),/invalid_occupied_slots/);
});
