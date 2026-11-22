// Stateless selection for a single unattended IDEA job; absolutely no side effects.
// Only explicit [AUTO-IDEA] owner-authored issues are eligible (opt-in).
import {intakeIdea,OWNER_ID} from './idea-intake-core.mjs';
const start='<!-- astonish:auto-worker:started:v1 -->';
const done='<!-- astonish:auto-worker:finished:v1 -->';
const blocked='<!-- astonish:auto-worker:blocked:v1 -->';
const whitelisted=/^\[IDEA-\d{1,6}\]\s*\[AUTO-IDEA\]/;
export const markers=Object.freeze({start,done,blocked});
export function selectOneIssue(issues, getComments, {ownerId=OWNER_ID}={}) {
 if(!Array.isArray(issues)||typeof getComments!=='function')throw new TypeError('invalid_queue');
 const candidates=[];
 for(const issue of issues.slice(0,100)){
  if(!issue||issue.state!=='open'||typeof issue.title!=='string'||!whitelisted.test(issue.title))continue;
  const plan=intakeIdea(issue,{ownerId});
  if(!plan.accepted)continue;
  if(plan.approvalRequired)continue;
  const comments=getComments(issue.number);
  if(!Array.isArray(comments))throw new TypeError('invalid_comments');
  if(comments.some(c=>typeof c?.body==='string'&&[start,done,blocked].some(m=>c.body.includes(m))))continue;
  candidates.push({issue,plan});
 }
 candidates.sort((a,b)=>{const rank={P0:0,P1:1,P2:2};return rank[a.plan.priority]-rank[b.plan.priority]||a.issue.number-b.issue.number});
 return candidates.length?{issueNumber:candidates[0].issue.number,priority:candidates[0].plan.priority,title:candidates[0].issue.title,plan:candidates[0].plan}:null;
}
export function createSafeStatus(kind,issueNumber,details={}){
 const map={started:start,finished:done,blocked};
 if(!map[kind]||!Number.isInteger(issueNumber)||issueNumber<1)throw new TypeError('invalid_status');
 const fields={issueNumber,status:kind,tests:Number.isInteger(details.tests)?details.tests:null,pass:Number.isInteger(details.pass)?details.pass:null,fail:Number.isInteger(details.fail)?details.fail:null};
 return map[kind]+'\n'+JSON.stringify(fields);
}
