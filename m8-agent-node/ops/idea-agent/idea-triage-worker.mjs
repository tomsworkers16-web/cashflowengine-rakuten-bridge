// One-shot private GitHub issue triage worker. Defaults to read-only.
// No AI API, no shell execution, no code modifications, no main/production actions.
// Environment: GH_TOKEN (Issues read/write only for the control repository).
import {intakeIdea,renderPlanMarkdown,OWNER_ID} from './idea-intake-core.mjs';
const REPO='tomsworkers16-web/cfe-m8-control';
const BASE='https://api.github.com/repos/'+REPO;
const marker='<!-- AstonishFactory:idea-intake:v1 -->';
const apply=process.argv.includes('--apply');
const token=process.env.GH_TOKEN || '';
const headers={'Accept':'application/vnd.github+json','User-Agent':'AstonishFactoryIdeaIntake/1.0','X-GitHub-Api-Version':'2022-11-28'};
if(token) headers.Authorization='Bearer '+token;
async function api(path,{method='GET',body}={}) {
  const response=await fetch(BASE+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw Error('github_http_'+response.status);
  return response.json();
}
export async function run({send=api,write=apply}={}) {
  if(!token && send===api) throw Error('missing_GH_TOKEN');
  const metadata=await send('');
  if(metadata.private!==true) throw Error('control_repository_not_private');
  const issues=await send('/issues?state=open&per_page=30');
  if(!Array.isArray(issues)) throw Error('invalid_issue_list');
  const results=[];
  for(const issue of issues.slice(0,30)) {
    const plan=intakeIdea(issue,{ownerId:OWNER_ID});
    if(!plan.accepted) continue;
    const comments=await send('/issues/'+issue.number+'/comments?per_page=100');
    if(!Array.isArray(comments)) throw Error('invalid_comments');
    if(comments.some(c=>typeof c?.body==='string' && c.body.includes(marker))) {
      results.push({issue:issue.number,status:'already_triaged'});continue;
    }
    if(write){
      await send('/issues/'+issue.number+'/comments',{method:'POST',body:{body:renderPlanMarkdown(plan)}});
      results.push({issue:issue.number,status:'triaged'});
    } else {
      results.push({issue:issue.number,status:'dry_run',priority:plan.priority});
    }
  }
  return {mode:write?'apply':'dry-run',processed:results.length,results};
}
if(process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  run().then(x=>process.stdout.write(JSON.stringify(x)+'\n')).catch(e=>{
    process.stderr.write('triage_failed: '+(String(e.message).startsWith('github_http_')?e.message:'internal_error')+'\n');process.exitCode=1;
  });
}
