import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createProjectJob} from './multi-project-job.mjs';
import {readFileSync} from 'node:fs';
const registry=JSON.parse(readFileSync(new URL('./project-registry.json',import.meta.url),'utf8'));
const runner=resolve('ops/idea-agent/coding-agent-runner.mjs');
const issue={number:51,title:'[IDEA-51] ソース整備',body:'記事の品質を改善してテストします',user:{id:267393119},labels:[{name:'project:cashflow'}]};
const runGit=(cwd,...args)=>{const p=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',timeout:10000});assert.equal(p.status,0,p.stderr);return p.stdout.trim()};
function setup(t,remote='https://github.com/tomsworkers16-web/cashflowengine-rakuten-bridge.git'){
 const dir=mkdtempSync(join(tmpdir(),'coding-gate-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const work=join(dir,'workspace');mkdirSync(work);runGit(work,'init','-q');writeFileSync(join(work,'README.md'),'sandbox\n');
 runGit(work,'add','README.md');runGit(work,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','init');
 const commit=runGit(work,'rev-parse','HEAD');
 runGit(work,'switch','-q','-c','agent/idea-51-implementation');
 runGit(work,'remote','add','origin',remote);
 const job=createProjectJob(issue,commit,registry);const jobFile=join(dir,'job.json');writeFileSync(jobFile,JSON.stringify(job));
 return {dir,work,jobFile,job};
}
function execute(x){return spawnSync(process.execPath,[runner,x.jobFile,x.work],{encoding:'utf8',timeout:10000,env:{...process.env,CFE_ISOLATION_ROOT:x.dir}})}
test('allowlisted origin produces dry-run only',t=>{const x=setup(t);const result=execute(x);assert.equal(result.status,0,result.stdout);const json=JSON.parse(result.stdout);assert.equal(json.status,'dry_run');assert.equal(json.willPush,false)});
test('rejects unrelated remote origin',t=>{const x=setup(t,'https://github.com/attacker/other.git');const result=execute(x);assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).reason,'git_remote_mismatch')});
test('rejects tampered path permissions',t=>{const x=setup(t);writeFileSync(x.jobFile,JSON.stringify({...x.job,allowedPaths:['']}));const result=execute(x);assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).reason,'project_binding_mismatch')});
test('rejects unexpected target repository',t=>{const x=setup(t);writeFileSync(x.jobFile,JSON.stringify({...x.job,repository:'other/other'}));const result=execute(x);assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).reason,'project_binding_mismatch')});
