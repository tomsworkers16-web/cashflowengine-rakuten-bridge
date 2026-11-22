import test from 'node:test';
import assert from 'node:assert/strict';
import {processOneJob} from './one-job-orchestrator.mjs';
const issue={number:40,title:'[IDEA-40] [AUTO-IDEA] 純粋関数の追加',body:'コードの検証を少し改善したい',labels:[],state:'open',user:{id:267393119}};
const job={issueNumber:40,allowProduction:false,allowPublish:false,allowMainMerge:false};
function service({list=[issue],prepare=async()=>job,execute=async()=>({status:'review_required',productionChanged:false,pushed:false}),review=async()=>({status:'submitted',tests:2,pass:2,fail:0})}={}){
 const calls=[];
 return {
  calls,
  deps:{
   listIssues:async()=>list,readComments:async()=>[],writeStatus:async(n,s)=>{calls.push(['status',n,s])},
   prepareJob:async(n)=>{calls.push(['prepare',n]);return prepare(n)},
   executeJob:async(j)=>{calls.push(['execute']);return execute(j)},
   submitReview:async(n,r)=>{calls.push(['review',n]);return review(n,r)}
  }
 };
}
test('dry-run never claims or executes',async()=>{const t=service();const r=await processOneJob(t.deps);assert.equal(r.status,'dry_run');assert.equal(t.calls.length,0)});
test('successful job is claimed before running',async()=>{const t=service();const r=await processOneJob({...t.deps,enabled:true});assert.equal(r.status,'review_submitted');assert.deepEqual(t.calls.map(x=>x[0]),['status','prepare','execute','review','status']);assert.match(t.calls[0][2],/started/);assert.match(t.calls[4][2],/finished/)});
test('no issue means idle',async()=>{const t=service({list:[]});assert.equal((await processOneJob({...t.deps,enabled:true})).status,'idle')});
test('incorrect job identity gets blocked',async()=>{const t=service({prepare:async()=>({...job,issueNumber:41})});const r=await processOneJob({...t.deps,enabled:true});assert.equal(r.status,'blocked');assert.equal(t.calls.some(x=>x[0]==='execute'),false)});
test('production enabled gets blocked',async()=>{const t=service({prepare:async()=>({...job,allowProduction:true})});assert.equal((await processOneJob({...t.deps,enabled:true})).status,'blocked')});
test('unverified runner result gets blocked',async()=>{const t=service({execute:async()=>({status:'passed',pushed:false,productionChanged:false})});const r=await processOneJob({...t.deps,enabled:true});assert.equal(r.status,'blocked');assert.equal(t.calls.some(x=>x[0]==='review'),false)});
test('review failure blocks without retry',async()=>{const t=service({review:async()=>({status:'failed'})});assert.equal((await processOneJob({...t.deps,enabled:true})).status,'blocked');assert.equal(t.calls.filter(x=>x[0]==='execute').length,1)});
test('missing callbacks rejected',async()=>{await assert.rejects(processOneJob({}),/missing_worker_dependency/)});
test('rejects malformed issue response',async()=>{const t=service();await assert.rejects(processOneJob({...t.deps,listIssues:async()=>null}),/invalid_issue_list/)});
test('unapproved external action ignored',async()=>{const t=service({list:[{...issue,body:'本番に公開してください'}]});assert.equal((await processOneJob({...t.deps,enabled:true})).status,'idle')});
