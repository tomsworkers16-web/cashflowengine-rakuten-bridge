// Product-neutral allowlist. No Issue body, label or LLM output can add a repository.
// All repo refs and permitted build rules must come from reviewed local configuration.
const namePattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const branchPattern=/^[A-Za-z0-9._/-]+$/;
const forbiddenRef=/(^|\/)(?:main|master|production|prod|release)(?:\/|$)/i;
const rulesFilePattern=/^(?:AGENTS\.md|CLAUDE\.md|docs\/[A-Za-z0-9_./-]+\.md)$/;
const forbiddenPath=/(^|\/)(?:\.git|\.env|node_modules|\.github\/workflows)(\/|$)|\.\.|\\/i;
export function validateRegistry(raw) {
 if(!raw||typeof raw!=='object'||raw.version!==1||!Array.isArray(raw.projects)||raw.projects.length===0||raw.projects.length>20)throw Error('invalid_registry');
 const ids=new Set(),repos=new Set();
 const projects=raw.projects.map(project=>{
  if(!project||typeof project!=='object'||!/^[-a-z0-9]{2,32}$/.test(project.id)||ids.has(project.id))throw Error('invalid_project_id');
  ids.add(project.id);
  if(typeof project.repository!=='string'||!namePattern.test(project.repository)||repos.has(project.repository))throw Error('invalid_repository');
  repos.add(project.repository);
  if(typeof project.baseBranch!=='string'||!branchPattern.test(project.baseBranch)||forbiddenRef.test(project.baseBranch)||project.baseBranch.includes('..')||project.baseBranch.startsWith('/')||project.baseBranch.endsWith('/'))throw Error('unsafe_base_branch');
  if(project.enabled!==true&&project.enabled!==false)throw Error('invalid_enabled');
  if(!Array.isArray(project.rules)||project.rules.length<1||project.rules.length>10||project.rules.some(p=>typeof p!=='string'||!rulesFilePattern.test(p)||p.includes('..')))throw Error('invalid_rules');
  if(!Array.isArray(project.allowedPaths)||project.allowedPaths.length<1||project.allowedPaths.length>10||project.allowedPaths.some(p=>typeof p!=='string'||!p.endsWith('/')||p.startsWith('/')||forbiddenPath.test(p)))throw Error('invalid_allowed_paths');
  if(typeof project.testCommand!=='string'||!/^npm (?:run [a-z][a-z0-9:-]{0,60}|test)$/.test(project.testCommand))throw Error('invalid_test_command');
  return Object.freeze({id:project.id,repository:project.repository,baseBranch:project.baseBranch,enabled:project.enabled,rules:Object.freeze([...project.rules]),allowedPaths:Object.freeze([...project.allowedPaths]),testCommand:project.testCommand});
 });
 return Object.freeze({version:1,projects:Object.freeze(projects)});
}
export function selectProject(registry,projectId) {
 const safe=validateRegistry(registry);
 if(typeof projectId!=='string'||!/^[-a-z0-9]{2,32}$/.test(projectId))throw Error('invalid_project_selection');
 const project=safe.projects.find(p=>p.id===projectId);
 if(!project||!project.enabled)throw Error('project_not_enabled');
 return project;
}
export function resolveIssueProject(issue,registry) {
 if(!issue||!Array.isArray(issue.labels))throw Error('invalid_issue_labels');
 const labels=issue.labels.map(x=>typeof x==='string'?x:x?.name).filter(x=>typeof x==='string');
 const options=labels.filter(label=>/^project:[-a-z0-9]{2,32}$/.test(label));
 if(options.length!==1)throw Error('project_label_missing_or_ambiguous');
 return selectProject(registry,options[0].slice(8));
}
export function reviewChangedPaths(project,paths){
 if(!project||!Array.isArray(project.allowedPaths)||!Array.isArray(paths))throw Error('invalid_diff_input');
 const forbidden=paths.filter(p=>typeof p!=='string'||p.startsWith('/')||p.includes('\\')||p.includes('..')||p.includes('\0')||!project.allowedPaths.some(prefix=>p.startsWith(prefix)));
 return {accepted:forbidden.length===0,forbidden};
}
