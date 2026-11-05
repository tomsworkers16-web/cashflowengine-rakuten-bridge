// Git index safety check. Only checks tracked *paths*, never reads or prints secrets.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(process.cwd(), '..');
const tracked = execFileSync('git',['ls-files','-z'],{cwd:repositoryRoot,encoding:'utf8'})
  .split('\0').filter(Boolean).map(x=>x.replace(/\\/g,'/'));
const prohibited = tracked.filter(file => {
  const components = file.split('/');
  const filename = components.at(-1) || '';
  const lower = filename.toLowerCase();
  if (components.some(c => ['.data','node_modules'].includes(c))) return true;
  if (filename === '.env' || (filename.startsWith('.env.') && !['.env.example','.env.sample'].includes(filename))) return true;
  if (lower === 'affiliate-results.json') return true;
  if (/\.(pem|key|sqlite|sqlite3|db)$/i.test(filename)) return true;
  if (/^(credentials|secrets)(\.|-|_)/i.test(filename) && !/\.example\./i.test(filename)) return true;
  return false;
});
if (prohibited.length) {
  console.error('Tracked potentially sensitive files detected (paths only):');
  for (const p of prohibited) console.error(' - ' + p);
  process.exitCode = 1;
} else {
  console.log('Tracked file path safety check passed.');
}
