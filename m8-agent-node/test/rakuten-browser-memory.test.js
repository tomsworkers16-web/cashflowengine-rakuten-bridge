import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBrowserMemory,inspectBrowserMemory,classifyChromeLaunchError} from '../src/rakuten-browser-memory.js';

test('Windows virtual-memory guard blocks Chrome with half a GiB headroom',()=>{
 const low=classifyBrowserMemory(0.51*1024*1024);
 assert.equal(low.status,'low');
 assert.equal(low.allowed,false);
 assert.equal(low.freeVirtualGiB,0.51);
 assert.equal(classifyBrowserMemory(2*1024*1024).allowed,true);
 assert.equal(classifyBrowserMemory(NaN).allowed,false);
 assert.equal(classifyBrowserMemory(-1).allowed,false);
});
test('Windows memory probe does not require real PowerShell in automated tests',()=>{
 const low=inspectBrowserMemory({platform:'win32',
  run:()=>({status:0,stdout:'534773\r\n'})});
 assert.equal(low.allowed,false);
 assert.equal(inspectBrowserMemory({platform:'win32',
  run:()=>({status:1,stderr:'WMI error'})}).status,'unknown');
 assert.equal(inspectBrowserMemory({platform:'linux'}).allowed,true);
});
test('Chrome crash is classified without returning verbose browser launch logs',()=>{
 assert.equal(classifyChromeLaunchError(new Error(
  'FATAL: low_level_alloc.cc VirtualAlloc failed, new_pages != nullptr failed')),
  'chrome_virtual_memory_exhausted');
 assert.equal(classifyChromeLaunchError(new Error(
  'locator.evaluateAll: Target page, context or browser has been closed')),
  'chrome_exited_unexpectedly');
 assert.equal(classifyChromeLaunchError(new Error('oops')),'rakuten_browser_operation_failed');
});
