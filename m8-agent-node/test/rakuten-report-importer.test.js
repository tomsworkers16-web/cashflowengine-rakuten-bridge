import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importRakutenReportFiles,scanRakutenInbox} from '../src/rakuten-report-importer.js';

test('daily inbox import is idempotent, then replaces updated daily totals',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-import-'));
  try{
    const inbox=path.join(dir,'rakuten-report-inbox');
    fs.mkdirSync(inbox);
    const file=path.join(inbox,'export.csv');
    fs.writeFileSync(file,'日付,クリック数,注文数,成果報酬額\n2026/11/05,3,1,80\n');
    assert.equal(scanRakutenInbox(dir).failures.length,0);
    assert.equal(scanRakutenInbox(dir).failures.length,0);
    const ledger=()=>JSON.parse(fs.readFileSync(path.join(dir,'affiliate-results.json'),'utf8'));
    assert.equal(ledger().records.length,1);
    fs.writeFileSync(file,'日付,クリック数,注文数,成果報酬額\n2026/11/05,4,1,90\n');
    assert.equal(scanRakutenInbox(dir).failures.length,0);
    assert.equal(ledger().records.length,1);
    assert.equal(ledger().records[0].rewardYen,90);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('invalid files cannot replace the previous valid ledger',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-invalid-'));
  try {
    const good=path.join(dir,'good.csv'),bad=path.join(dir,'bad.csv');
    fs.writeFileSync(good,'日付,クリック数\n2026/11/05,3\n');
    assert.equal(importRakutenReportFiles(dir,[good]).imported.length,1);
    const before=fs.readFileSync(path.join(dir,'affiliate-results.json'),'utf8');
    fs.writeFileSync(bad,'注文ID,報酬\nabc,999\n');
    const result=importRakutenReportFiles(dir,[bad]);
    assert.equal(result.failures.length,1);
    assert.equal(fs.readFileSync(path.join(dir,'affiliate-results.json'),'utf8'),before);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
