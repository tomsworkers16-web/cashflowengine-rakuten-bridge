import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../src/preview-threads-daily-cycle.js',import.meta.url));
test('read-only rehearsal holds without credentials and leaves directory unchanged',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-preview-test-'));
 try{
  const env={...process.env,CFE_DATA_DIR:dir,RAKUTEN_APPLICATION_ID:'',RAKUTEN_ACCESS_KEY:'',RAKUTEN_AFFILIATE_ID:'',THREADS_ACCESS_TOKEN:''};
  const r=spawnSync(process.execPath,[cli,'--read-only-research'],{env,encoding:'utf8'});
  assert.equal(r.status,2,r.stderr);const output=JSON.parse(r.stdout);assert.equal(output.reason,'rakuten_credentials_missing');assert.equal(output.published,0);assert.equal(output.approvalWritten,false);assert.deepEqual(fs.readdirSync(dir),[]);
  const noFlag=spawnSync(process.execPath,[cli],{env,encoding:'utf8'});assert.equal(noFlag.status,1);assert.deepEqual(fs.readdirSync(dir),[]);
 }finally{fs.rmdirSync(dir);}
});
