// Offline only. Example: node idea-intake-cli.mjs < issue.json
import {readFileSync} from 'node:fs';
import {intakeIdea,renderPlanMarkdown} from './idea-intake-core.mjs';
try {
  const input=JSON.parse(readFileSync(0,'utf8'));
  const plan=intakeIdea(input);
  if(!plan.accepted){process.stderr.write('rejected: '+plan.reason+'\n');process.exitCode=2}
  else {process.stdout.write(renderPlanMarkdown(plan)+'\n')}
} catch(e) {
  process.stderr.write('invalid_input\n');process.exitCode=2;
}