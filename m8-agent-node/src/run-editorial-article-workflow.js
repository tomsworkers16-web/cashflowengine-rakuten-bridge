// Local-only article workflow runner: reads input, emits JSON, cannot publish anything.
import { readFileSync } from 'node:fs';
import { buildEditorialArticleWorkflow } from './editorial-article-workflow.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/run-editorial-article-workflow.js input.json');
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(readFileSync(file, 'utf8'));
    const result = buildEditorialArticleWorkflow(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    console.error('Article workflow error:', error.message);
    process.exitCode = 2;
  }
}
