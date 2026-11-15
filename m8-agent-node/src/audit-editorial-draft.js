// Local-only editorial draft audit: no publishing, network, or mutation.
import { readFileSync } from 'node:fs';
import { evaluateEditorialDraft, revisionRequest } from './editorial-quality-gate.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/audit-editorial-draft.js path/to/draft.json');
  process.exitCode = 2;
} else {
  try {
    const draft = JSON.parse(readFileSync(file, 'utf8'));
    const report = evaluateEditorialDraft(draft);
    process.stdout.write(JSON.stringify({
      audit: report,
      nextStep: report.status === 'revision_required'
        ? revisionRequest(draft, report)
        : { task: 'owner_review', instruction: '公開前にオーナー承認と商品事実・素材権利の外部確認が必要' }
    }, null, 2) + '\n');
    if (report.status !== 'review_candidate') process.exitCode = 1;
  } catch (error) {
    console.error('Editorial audit failed:', error.message);
    process.exitCode = 2;
  }
}
