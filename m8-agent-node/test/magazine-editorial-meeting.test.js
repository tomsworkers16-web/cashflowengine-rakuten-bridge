import test from 'node:test';
import assert from 'node:assert/strict';
import {planEditorialMeeting} from '../src/magazine-editorial-meeting.js';
test('recent topic and voice are not selected again when alternatives exist',()=>{
 const first=planEditorialMeeting('2026-11-11','19:30');
 const next=planEditorialMeeting('2026-11-12','19:30',{history:[{...first,day:'2026-11-11'}],observations:[{views:99}]});
 assert.notEqual(next.topicId,first.topicId);
 assert.notEqual(next.approach,first.approach);
 assert.equal(next.format,'feature');
 assert.equal(next.measuredObservations,1);
 assert.equal(next.performanceUsedForRanking,false);
 assert.equal(next.publicationAllowed,false);
});
test('empty history still produces distinct candidate topics and slot format guidance',()=>{
 const p=planEditorialMeeting('2026-11-11','12:30');
 assert.equal(p.format,'medium');
 assert.equal(new Set(p.alternatives.map(x=>x.topicId)).size,3);
 assert.equal(p.status,'planning_only');
});
