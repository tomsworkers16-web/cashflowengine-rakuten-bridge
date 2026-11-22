// One bounded pass through an explicitly opted-in IDEA queue.
// Dependency injection keeps GitHub transport, Codex execution, and secret storage isolated.
import {selectOneIssue,createSafeStatus} from './auto-queue.mjs';
export async function processOneJob({
  listIssues,readComments,writeStatus,prepareJob,executeJob,submitReview,
  enabled=false
}={}) {
 if(![listIssues,readComments,writeStatus,prepareJob,executeJob,submitReview].every(x=>typeof x==='function'))throw new TypeError('missing_worker_dependency');
 const issues=await listIssues();
 if(!Array.isArray(issues))throw new TypeError('invalid_issue_list');
 const memo=new Map();
 for(const i of issues.slice(0,100)){
  if(!i?.number||i.state!=='open')continue;
  // Never retrieve comments from non-opted-in issues.
  if(!/^\[IDEA-\d{1,6}\]\s*\[AUTO-IDEA\]/.test(i.title||''))continue;
  memo.set(i.number,await readComments(i.number));
 }
 const selected=selectOneIssue(issues,number=>memo.get(number)||[]);
 if(!selected)return {status:'idle',processed:0};
 if(!enabled)return {status:'dry_run',processed:0,issueNumber:selected.issueNumber,priority:selected.priority};
 const number=selected.issueNumber;
 // Claim BEFORE invoking the coding agent. Retry is forbidden unless reviewed and reset.
 await writeStatus(number,createSafeStatus('started',number));
 try {
  const job=await prepareJob(number);
  if(!job || job.issueNumber!==number || job.allowProduction!==false || job.allowPublish!==false || job.allowMainMerge!==false)throw Error('unsafe_job');
  const result=await executeJob(job);
  if(!result || result.status!=='review_required' || result.productionChanged!==false || result.pushed!==false)throw Error('execution_unverified');
  const review=await submitReview(number,result);
  if(!review || review.status!=='submitted')throw Error('review_not_confirmed');
  await writeStatus(number,createSafeStatus('finished',number,{tests:review.tests,pass:review.pass,fail:review.fail}));
  return {status:'review_submitted',processed:1,issueNumber:number};
 } catch(_error) {
  // Never send exception text to GitHub (may include credentials). Never auto-retry.
  try {await writeStatus(number,createSafeStatus('blocked',number));}
  catch {return {status:'blocked_unreported',processed:1,issueNumber:number};}
  return {status:'blocked',processed:1,issueNumber:number};
 }
}
