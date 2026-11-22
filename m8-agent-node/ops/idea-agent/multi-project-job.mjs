// Assemble coding jobs strictly from locally approved project registry.
// Issue text and untrusted project labels cannot grant repository or path permissions.
import {createCodingJob} from './coding-agent-job-builder.mjs';
import {resolveIssueProject,reviewChangedPaths} from './project-registry.mjs';
export function createProjectJob(issue,baseCommit,registry,{timeoutSeconds=600}={}) {
 const project=resolveIssueProject(issue,registry);
 const job=createCodingJob(issue,baseCommit,{baseBranch:project.baseBranch,timeoutSeconds});
 return Object.freeze({...job,projectId:project.id,repository:project.repository,allowedPaths:[...project.allowedPaths],rules:[...project.rules],testCommand:project.testCommand});
}
export function checkProjectOutput(job,registry,changes) {
 if(!job||typeof job!=='object'||!Array.isArray(changes))throw Error('invalid_output');
 const project=resolveIssueProject({labels:[{name:'project:'+job.projectId}]},registry);
 if(job.repository!==project.repository||job.baseBranch!==project.baseBranch)throw Error('mismatched_target');
 if(job.allowedPaths?.length!==project.allowedPaths.length||job.allowedPaths.some((p,i)=>p!==project.allowedPaths[i]))throw Error('mismatched_permissions');
 return reviewChangedPaths(project,changes);
}
