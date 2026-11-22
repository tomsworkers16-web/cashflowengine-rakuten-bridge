import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProjectJob,checkProjectOutput} from './multi-project-job.mjs';
const config=JSON.parse(readFileSync(new URL('./project-registry.json',import.meta.url),'utf8'));
const issue={number:51,title:'[IDEA-51] 記事の品質改善',body:'楽天の記事品質チェック処理を改善しテストする',user:{id:267393119},labels:[{name:'project:cashflow'}]};
test('issue resolves into concrete allowed repository',()=>{
 const job=createProjectJob(issue,'a'.repeat(40),config);
 assert.equal(job.repository,'tomsworkers16-web/cashflowengine-rakuten-bridge');
 assert.equal(job.projectId,'cashflow');
 assert.equal(job.baseBranch,'docs/editorial-quality-gate-b-20261116');
 assert.equal(job.allowProduction,false);
});
test('job refuses other project label until enabled',()=>{
 assert.throws(()=>createProjectJob({...issue,labels:[{name:'project:utility-plus'}]},'a'.repeat(40),config),/project_not_enabled/);
});
test('unlabeled jobs fail closed',()=>assert.throws(()=>createProjectJob({...issue,labels:[]},'a'.repeat(40),config),/project_label_missing/));
test('accepts only permitted output paths',()=>{
 const job=createProjectJob(issue,'a'.repeat(40),config);
 assert.equal(checkProjectOutput(job,config,['m8-agent-node/src/review.js','m8-agent-node/test/review.test.js']).accepted,true);
 assert.equal(checkProjectOutput(job,config,['src/main.js']).accepted,false);
});
test('tampered repository rejected before review',()=>{
 const job=createProjectJob(issue,'a'.repeat(40),config);
 assert.throws(()=>checkProjectOutput({...job,repository:'outsider/attacker'},config,['m8-agent-node/src/review.js']),/mismatched_target/);
});
test('tampered allowlist rejected before review',()=>{
 const job=createProjectJob(issue,'a'.repeat(40),config);
 assert.throws(()=>checkProjectOutput({...job,allowedPaths:['']},config,['secret.env']),/mismatched_permissions/);
});
test('bad pinned commit rejected',()=>assert.throws(()=>createProjectJob(issue,'main',config),/invalid_base_commit/));
