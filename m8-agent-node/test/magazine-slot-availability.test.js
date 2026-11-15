import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFusionPostingSlots} from '../src/magazine-slot-availability.js';
test('unknown scheduler state blocks all claims of safe experiment availability',()=>{
 const v=assessFusionPostingSlots({dayFrom:'2026-11-16'});
 assert.equal(v.status,'scheduler_state_unknown');
 assert.equal(v.safeToSchedule,false);
 assert.equal(v.publicationAllowed,false);
});
test('recurring autopost marks every day of its configured slots occupied, including future dates',()=>{
 const v=assessFusionPostingSlots({dayFrom:'2026-11-16',dayCount:5,autoPostEnabled:true,configuredSlots:['07:30','12:30','19:30']});
 assert.equal(v.status,'offline_collision_assessment');
 assert.equal(v.occupiedSlots.length,15);
 assert.deepEqual(v.occupiedSlots.filter(x=>x.slot==='19:30').map(x=>x.jstDate),['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20']);
 assert.equal(v.safeToSchedule,false);
 assert.equal(v.checkedLiveScheduler,false);
});
test('pending or uncertain posts keep their slot reserved even if recurring posts disabled',()=>{
 const v=assessFusionPostingSlots({dayFrom:'2026-11-16',dayCount:2,autoPostEnabled:false,configuredSlots:['19:30'],posts:[{jstDate:'2026-11-16',slot:'19:30',id:null,meta:{publishStatus:'uncertain'}},{jstDate:'2026-11-16',slot:'19:30',id:'1'}]});
 assert.equal(v.occupiedSlots.length,1);
 assert.deepEqual(v.occupiedSlots[0].reasons,['post_journal_attempt']);
});
test('rejects malformed scheduler state instead of trusting it',()=>{
 assert.throws(()=>assessFusionPostingSlots({dayFrom:'2026-11-16',autoPostEnabled:true,configuredSlots:['unknown']}),/invalid_configured_slots/);
 assert.throws(()=>assessFusionPostingSlots({dayFrom:'2026-11-16',autoPostEnabled:true,configuredSlots:[],posts:{}}),/invalid_post_journal/);
});
