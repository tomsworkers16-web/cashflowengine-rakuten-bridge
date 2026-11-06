import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Daily Commander never starts nightly capture as fallback',()=>{
 const source=fs.readFileSync(path.resolve('src/operations-agent.js'),'utf8');
 const start=source.indexOf('async function runDailyCommander()');
 const end=source.indexOf("const mode = process.argv[2]",start);
 assert.ok(start>0&&end>start);
 const body=source.slice(start,end);
 assert.ok(!body.includes('await buildNightReport('));
 assert.ok(!body.includes('runRakutenNightlyCapture('));
 assert.ok(body.includes("if (!latest) latest = { status: 'NORMAL'"));
});
