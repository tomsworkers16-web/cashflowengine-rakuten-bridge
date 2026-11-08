import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {summarizeButtons,validDiagnosisUrl} from '../src/diagnose-external-reply.js';

test('read-only reply diagnostic accepts only explicit Threads post URL',()=>{
  assert.equal(validDiagnosisUrl('https://www.threads.com/@shinkyo_ha_kireini/post/DfTd7wnikxb'),true);
  assert.equal(validDiagnosisUrl('https://evil.invalid/@shinkyo_ha_kireini/post/DfTd7wnikxb'),false);
  assert.equal(validDiagnosisUrl('https://www.threads.com/@shinkyo_ha_kireini/post/DfTd7wnikxb?x=1'),false);
});
test('diagnostic button summary contains no user secrets and is capped',()=>{
 const x=Array.from({length:50},(_,i)=>({aria:'Reply',text:'返信',disabled:false,withinDialog:i%2===0}));
 assert.equal(summarizeButtons(x).length,35);
 assert.equal(summarizeButtons(x)[0].withinDialog,true);
});
test('diagnostic never contains publishing click, keyboard type or Enter',()=>{
 const code=fs.readFileSync(path.resolve('src/diagnose-external-reply.js'),'utf8');
 assert.doesNotMatch(code,/submit\.click\(|getByRole\('button',\s*\{name:\/投稿/);
 assert.doesNotMatch(code,/keyboard\.type\(|\.press\('Enter'\)/);
 assert.match(code,/noPosting:true/);
});

test('diagnostic clicks only inline textbox, never reply icon or submit',()=>{
 const code=fs.readFileSync(path.resolve('src/diagnose-external-reply.js'),'utf8');
 assert.match(code,/getByRole\('textbox'\)/);
 assert.match(code,/editor\.click\(\)/);
 assert.doesNotMatch(code,/getByRole\('button'/);
 assert.match(code,/navigationChanged/);
 assert.match(code,/target_url_changed_before_editor/);
});

test('draft diagnostic fills and clears without any submit',()=>{
 const code=fs.readFileSync(path.resolve('src/diagnose-external-reply.js'),'utf8');
 assert.match(code,/editor\.fill\('【送信しない診断用下書き】'\)/);
 assert.match(code,/editor\.fill\(''\)/);
 assert.match(code,/target_url_changed_after_draft/);
 assert.match(code,/skipped_reply_recipient_not_visible/);
 assert.doesNotMatch(code,/submit\.click\(|getByRole\('button'/);
});

test('diagnostic records local send-control geometry without clicking send',()=>{
 const code=fs.readFileSync(path.resolve('src/diagnose-external-reply.js'),'utf8');
 assert.match(code,/sendCandidates:state\.sendCandidates/);
 assert.match(code,/querySelectorAll\('\[role="button"\],button,\[tabindex\],svg'\)/);
 assert.match(code,/getBoundingClientRect\(\)/);
 assert.doesNotMatch(code,/submit\.click\(|\.press\('Enter'\)/);
});
