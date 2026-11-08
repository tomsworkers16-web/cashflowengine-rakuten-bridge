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
test('diagnostic never contains a publishing click, keyboard type or fill',()=>{
 const code=fs.readFileSync(path.resolve('src/diagnose-external-reply.js'),'utf8');
 assert.doesNotMatch(code,/submit\.click\(|getByRole\('button',\s*\{name:\/投稿/);
 assert.doesNotMatch(code,/\.fill\(|keyboard\.type\(|\.press\('Enter'\)/);
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
