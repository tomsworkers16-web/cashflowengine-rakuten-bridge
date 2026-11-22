import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const runner=resolve('ops/idea-agent/coding-agent-runner.mjs');
test('runner with no arguments is fail closed',()=>{
 const result=spawnSync(process.execPath,[runner],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,2);
 const payload=JSON.parse(result.stdout);
 assert.equal(payload.status,'blocked');
 assert.equal(payload.reason,'usage_job_json_workspace');
});
test('runner never executes without job config',()=>{
 const result=spawnSync(process.execPath,[runner,'invalid-file','invalid-path','--execute'],{encoding:'utf8',timeout:10000,env:{...process.env,CFE_CODEX_RUN_ALLOWED:'1'}});
 assert.equal(result.status,2);
 assert.equal(JSON.parse(result.stdout).status,'blocked');
});
