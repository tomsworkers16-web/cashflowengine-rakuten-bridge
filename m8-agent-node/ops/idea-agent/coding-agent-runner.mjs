// Single-job Codex executor PoC. Does NOT push, commit, merge, publish or post.
import {readFileSync,realpathSync,mkdirSync,rmdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateJob,checkWorkspace,codexInvocation,sanitizeEnvironment,classifyDiffFiles} from './coding-agent-core.mjs';
const configFile=process.argv[2],workspaceArg=process.argv[3];
const execute=process.argv.includes('--execute');
const refusal=(message)=>{process.stdout.write(JSON.stringify({status:'blocked',reason:message})+'\n');process.exitCode=2;};
function git(cwd,...args) {
 const r=spawnSync('git',['--no-optional-locks','-C',cwd,...args],{encoding:'utf8',timeout:10000,windowsHide:true,env:sanitizeEnvironment(process.env),maxBuffer:2*1024*1024});
 if(r.error||r.status!==0)throw Error('git_check_failed');
 return r.stdout.trim();
}
function inspectedChanges(cwd) {
 const names=git(cwd,'status','--porcelain=v1','--untracked-files=all');
 if(!names)return [];
 return names.split(/\r?\n/).map(x=>x.slice(3).trim()).filter(Boolean);
}
try {
 if(!configFile||!workspaceArg)throw Error('usage_job_json_workspace');
 const job=validateJob(JSON.parse(readFileSync(configFile,'utf8')));
 const root=process.env.CFE_ISOLATION_ROOT;
 if(!root)throw Error('missing_isolation_root');
 const work=checkWorkspace(realpathSync(resolve(workspaceArg)),realpathSync(resolve(root)));
 if(git(work,'rev-parse','--is-inside-work-tree')!=='true')throw Error('not_git_worktree');
 const branch=git(work,'branch','--show-current');
 if(branch!==job.branch)throw Error('unexpected_checkout_branch');
 if(git(work,'rev-parse','HEAD')!==job.baseCommit)throw Error('checkout_commit_mismatch');
 if(inspectedChanges(work).length)throw Error('worktree_not_clean');
 const {command,args}=codexInvocation(job);
 if(!execute){
  process.stdout.write(JSON.stringify({status:'dry_run',id:job.id,workspace:work,branch,command,arguments:args.slice(0,-1),timeoutSeconds:job.timeoutSeconds,willPush:false})+'\n');
 } else {
  if(process.env.CFE_CODEX_RUN_ALLOWED!=='1')throw Error('execution_not_enabled');
  const lock=resolve(root,'.cfe-coding-agent-lock');
  if(existsSync(lock))throw Error('job_lock_held');
  mkdirSync(lock);
  try {
   const runner=spawnSync(command,args,{cwd:work,encoding:'utf8',windowsHide:true,env:sanitizeEnvironment(process.env),timeout:job.timeoutSeconds*1000,maxBuffer:1024*1024});
   // Do not persist or upload Codex output; it could contain confidential material.
   const modified=inspectedChanges(work);
   const diffGate=classifyDiffFiles(modified);
   const ok=(!runner.error&&runner.status===0&&diffGate.accepted);
   process.stdout.write(JSON.stringify({status:ok?'review_required':'blocked',id:job.id,exitCode:runner.status,changedFileCount:modified.length,diffAllowed:diffGate.accepted,forbiddenCount:diffGate.forbidden.length,executionTimedOut:runner.error?.code==='ETIMEDOUT',pushed:false,productionChanged:false})+'\n');
   if(!ok)process.exitCode=2;
  }finally{rmdirSync(lock)}
 }
} catch(e) {refusal(e.message);}
