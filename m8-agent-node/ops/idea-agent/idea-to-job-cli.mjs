// Compile one owner-authored private IDEA issue into a bounded offline coding job.
// No network, credentials, code execution, file writes or GitHub mutation.
import {readFileSync} from 'node:fs';
import {createCodingJob} from './coding-agent-job-builder.mjs';
const [,,issuePath,baseCommit] = process.argv;
try {
 if(!issuePath || !baseCommit)throw Error('usage_issue_json_and_commit');
 const issue = JSON.parse(readFileSync(issuePath,'utf8'));
 const job = createCodingJob(issue,baseCommit);
 process.stdout.write(JSON.stringify(job,null,2)+'\n');
} catch (error) {
 const code=['usage_issue_json_and_commit','idea_not_accepted','invalid_base_commit','invalid_prompt'].includes(error.message)?error.message:'invalid_job_input';
 process.stderr.write('job_not_created: '+code+'\n');
 process.exitCode=2;
}
