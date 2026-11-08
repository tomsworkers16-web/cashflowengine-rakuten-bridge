import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function assertPostingWindowGuard(script) {
 // Windows git checkouts may use CRLF, while the repository uses LF.
 const normalized = script.replace(/\r\n/g, '\n');
 const start = normalized.indexOf('function Test-PostingWindow');
 const check = normalized.indexOf('if (Test-PostingWindow)');
 const stop = normalized.indexOf('  Stop-LocalCore\n  & $git merge --ff-only');
 assert.ok(start >= 0, 'posting window function must exist');
 assert.ok(check > start, 'posting window must be checked after declaration');
 assert.ok(stop > check, 'posting window must be checked before stopping the core');
 assert.match(normalized, /Tokyo Standard Time/);
 assert.match(normalized, /posting_window_defer_core_restart/);
 assert.match(normalized, /CFE_POST_SLOTS=/);
 assert.match(normalized, /minuteNow -ge/);
 assert.match(normalized, /minuteNow -le/);
}

test('M8 auto-update checks the JST posting window before a core restart on LF and CRLF checkouts', () => {
 const script = fs.readFileSync(path.resolve('auto-update-agent.ps1'), 'utf8');
 assertPostingWindowGuard(script);
 assertPostingWindowGuard(script.replace(/\r?\n/g, '\r\n'));
});
