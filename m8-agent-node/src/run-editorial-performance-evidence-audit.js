// Reads the existing local ledger; does not access credentials, APIs, or publish.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditEditorialPerformanceEvidence } from './editorial-performance-evidence-audit.js';

try {
  const filename = resolve(process.argv[2] || resolve(process.env.CFE_DATA_DIR || '.data', 'affiliate-results.json'));
  const stat = statSync(filename);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('invalid_ledger');
  const result = auditEditorialPerformanceEvidence(JSON.parse(readFileSync(filename, 'utf8')));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch {
  process.stdout.write(JSON.stringify(auditEditorialPerformanceEvidence(null)) + '\n');
  process.exitCode = 2;
}
