import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('M8 auto-update checks the JST posting window before a core restart',()=>{
 const script=fs.readFileSync(path.resolve('auto-update-agent.ps1'),'utf8');
 const start=script.indexOf('function Test-PostingWindow');
 const check=script.indexOf('if (Test-PostingWindow)');
 const stop=script.indexOf('  Stop-LocalCore\n  & $git merge --ff-only');
 assert.ok(start>=0);
 assert.ok(check>start);
 assert.ok(stop>check);
 assert.match(script,/Tokyo Standard Time/);
 assert.match(script,/posting_window_defer_core_restart/);
 assert.match(script,/CFE_POST_SLOTS=/);
 assert.match(script,/minuteNow -ge/);
 assert.match(script,/minuteNow -le/);
});
