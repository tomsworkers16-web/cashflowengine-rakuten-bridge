import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodingJob} from './coding-agent-job-builder.mjs';
import {OWNER_ID} from './idea-intake-core.mjs';
const idea={number:23,title:'[IDEA-002] 安全な記事改善',user:{id:OWNER_ID},body:'楽天の比較記事を作り、クリック率を改善したい',labels:[]};
test('approved idea becomes bounded job',()=>{
 const job=createCodingJob(idea,'b'.repeat(40));
 assert.equal(job.id,'IDEA-23');
 assert.equal(job.branch,'agent/idea-23-implementation');
 assert.equal(job.timeoutSeconds,600);
 assert.equal(job.allowProduction,false);
 assert.match(job.prompt,/クリック率/);
});
test('refuses unauthorised issue',()=>assert.throws(()=>createCodingJob({...idea,user:{id:99}},'b'.repeat(40)),/idea_not_accepted/));
test('rejects idea containing suspected secrets',()=>assert.throws(()=>createCodingJob({...idea,body:'password is secret'},'b'.repeat(40)),/idea_not_accepted/));
test('requires pinned commit hash',()=>assert.throws(()=>createCodingJob(idea,'main'),/invalid_base_commit/));
test('enforces bounded execution',()=>assert.throws(()=>createCodingJob(idea,'b'.repeat(40),{timeoutSeconds:3600}),/invalid_timeout/));
