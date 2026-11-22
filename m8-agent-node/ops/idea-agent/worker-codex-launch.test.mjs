import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {buildWorkerCodexLaunch} from './worker-codex-launch.mjs';
test('Windows worker uses dedicated Codex entrypoint and exact unelevated setting',()=>{
 const root=join(process.cwd(),'worker-test-localappdata');
 const expected=join(root,'AF-CodexTools','node_modules','@openai','codex','bin','codex.js');
 const launch=buildWorkerCodexLaunch({platform:'win32',env:{LOCALAPPDATA:root},fileExists:p=>p===expected});
 assert.equal(launch.executable,process.execPath);
 assert.deepEqual(launch.arguments.slice(1),['-c','windows.sandbox="unelevated"','exec','--ephemeral','--sandbox','workspace-write','-']);
 assert.equal(launch.arguments[0],expected);
 assert.ok(!launch.arguments.includes('danger-full-access'));
});
test('Windows missing worker installation fails closed',()=>{
 assert.throws(()=>buildWorkerCodexLaunch({platform:'win32',env:{LOCALAPPDATA:'C:/x'},fileExists:()=>false}),/worker_codex_entrypoint_missing/);
});
test('Windows missing LOCALAPPDATA fails closed',()=>{
 assert.throws(()=>buildWorkerCodexLaunch({platform:'win32',env:{},fileExists:()=>true}),/worker_localappdata_missing/);
});
test('other platforms retain bounded workspace-write invocation',()=>{
 const launch=buildWorkerCodexLaunch({platform:'linux'});
 assert.equal(launch.executable,'codex');
 assert.deepEqual(launch.arguments,['exec','--ephemeral','--sandbox','workspace-write','-']);
});
