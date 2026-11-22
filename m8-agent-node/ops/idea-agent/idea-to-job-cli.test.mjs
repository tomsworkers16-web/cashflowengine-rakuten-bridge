import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=resolve('ops/idea-agent/idea-to-job-cli.mjs');
const valid={number:23,user:{id:267393119},title:'[IDEA-002] 比較記事の改善',body:'売上を増やすため、比較記事のテストを追加して改善したい。',labels:[]};
function invoke(issue,sha='a'.repeat(40)) {
 const dir=mkdtempSync(join(tmpdir(),'idea-to-job-'));
 const f=join(dir,'issue.json');
 try {
  writeFileSync(f,JSON.stringify(issue));
  return spawnSync(process.execPath,[cli,f,sha],{encoding:'utf8',timeout:10000});
 } finally {rmSync(dir,{recursive:true,force:true})}
}
test('turns validated issue into fixed branch Codex job',()=>{
 const r=invoke(valid);assert.equal(r.status,0);
 const job=JSON.parse(r.stdout);
 assert.equal(job.branch,'agent/idea-23-implementation');
 assert.equal(job.allowProduction,false);
 assert.equal(job.baseCommit,'a'.repeat(40));
});
test('rejects spoofed author without emitting job',()=>{
 const r=invoke({...valid,user:{id:2}});
 assert.equal(r.status,2);assert.equal(r.stdout,'');
});
test('rejects invalid pinned commit',()=>{
 const r=invoke(valid,'main');
 assert.equal(r.status,2);assert.match(r.stderr,/invalid_base_commit/);
});
test('rejects secret-bearing issue',()=>{
 const r=invoke({...valid,body:'my password is abcdef'});
 assert.equal(r.status,2);assert.equal(r.stdout,'');
});
