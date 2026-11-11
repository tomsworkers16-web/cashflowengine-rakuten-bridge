import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFusionExperiment} from '../src/magazine-fusion-experiment.js';
const row=(postId,arm,slot='12:30')=>({postId,jstDate:'2026-11-11',slot,arm,itemCode:'shop:123',topicId:'kitchen-cleanup'});
test('two-arm offline report keeps unknown attribution and excludes missing views',()=>{
 const assignments=[row('101','baseline'),row('102','fusion'),row('103','baseline','19:30')];
 const posts=assignments.map((x,i)=>({id:x.postId,jstDate:x.jstDate,slot:x.slot,at:'2026-11-11T12:30:00+09:00',text:'水切りについて',meta:{role:'revenue'}}));
 const reports=[{generatedAt:'2026-11-12T12:30:00+09:00',threadsInsights:{posts:[{id:'101',metrics:{views:100}},{id:'102',metrics:{views:160}}]}}];
 const result=summarizeFusionExperiment(assignments,posts,reports,{targetDay:'2026-11-12'});
 assert.equal(result.groups.find(x=>x.arm==='baseline'&&x.slot==='12:30').averageViewsNear24h,100);
 assert.equal(result.groups.find(x=>x.arm==='fusion'&&x.slot==='12:30').averageViewsNear24h,160);
 assert.equal(result.groups.find(x=>x.arm==='baseline'&&x.slot==='19:30').missingViews,1);
 assert.deepEqual(result.comparableSlots,[]);
 assert.equal(result.affiliateClicks,'unknown');assert.equal(result.winner,'undetermined');
 assert.equal(result.publicationAllowed,false);
});
test('rejects duplicate or mislabeled posts; does not invent winners or rewards',()=>{
 const p=[row('101','baseline'),row('101','fusion')];
 assert.throws(()=>summarizeFusionExperiment(p,[],[],{targetDay:'2026-11-12'}),/experiment_duplicate_post_id/);
 assert.throws(()=>summarizeFusionExperiment([{...row('101','baseline'),arm:'unsupported'}],[],[],{targetDay:'2026-11-12'}),/experiment_assignment_invalid/);
});
