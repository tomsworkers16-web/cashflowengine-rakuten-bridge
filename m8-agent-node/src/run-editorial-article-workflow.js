// Local-only article workflow runner: reads input, emits JSON, cannot publish anything.
import { readFileSync, statSync } from 'node:fs';
import { buildEditorialArticleWorkflow } from './editorial-article-workflow.js';

const file = process.argv[2];
const flags = process.argv.slice(3);
function readJson(filename) {
  const stat = statSync(filename);
  if (!stat.isFile() || stat.size > 10*1024*1024) throw new Error('invalid_input_file');
  return JSON.parse(readFileSync(filename, 'utf8'));
}
if (!file) {
  console.error('Usage: node src/run-editorial-article-workflow.js input.json [--ledger affiliate-results.json]');
  process.exitCode = 2;
} else {
  try {
    if (flags.length && (flags.length !== 2 || flags[0] !== '--ledger' || !flags[1])) throw new Error('invalid_arguments');
    const input = readJson(file);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_input');
    if (flags.length) {
      if (Object.hasOwn(input,'performanceRecords')) throw new Error('conflicting_performance_sources');
      const ledger = readJson(flags[1]);
      if (!Array.isArray(ledger?.records)) throw new Error('invalid_ledger');
      input.performanceRecords = ledger.records;
    }
    const result = buildEditorialArticleWorkflow(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    console.error('Article workflow error: invalid input, ledger, or options');
    process.exitCode = 2;
  }
}
