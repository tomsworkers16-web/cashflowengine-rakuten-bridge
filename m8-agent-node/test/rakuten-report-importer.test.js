import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importRakutenReportFiles,scanRakutenInbox,recoverRakutenRejectedFiles} from '../src/rakuten-report-importer.js';

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

test('nightly offline recovery reuses saved CSV without overwriting newer totals',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-recover-'));
 try{
  const rejected=path.join(dir,'rakuten-report-rejected');
  fs.mkdirSync(rejected);
  fs.writeFileSync(path.join(rejected,'rejected-1793907495180-14460.csv'),
   '楽天期間別レポート "日別\n\n発生日,成果報酬,クリック数,売上件数,売上金額\n2026/11/04,20,8,1,1000\n2026/11/05,30,12,1,1600\n');
  const newer=path.join(dir,'newer.csv');
  fs.writeFileSync(newer,'日付,クリック数,成果報酬\n2026/11/05,20,50\n');
  assert.equal(importRakutenReportFiles(dir,[newer]).failures.length,0);
  const once=recoverRakutenRejectedFiles(dir);
  assert.equal(once.daysRecovered,1);
  const records=JSON.parse(fs.readFileSync(path.join(dir,'affiliate-results.json'),'utf8')).records;
  assert.equal(records.length,2);
  assert.equal(records.find(x=>x.jstDate==='2026-11-04').rewardYen,20);
  assert.equal(records.find(x=>x.jstDate==='2026-11-05').rewardYen,50);
  const twice=recoverRakutenRejectedFiles(dir);
  assert.equal(twice.daysRecovered,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid old CSV cannot change the ledger during nightly recovery',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-recover-bad-'));
 try{
  const folder=path.join(dir,'rakuten-report-rejected');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder,'rejected-1-22.csv'),'注文番号,売上金額\nsecret,5000\n');
  const out=recoverRakutenRejectedFiles(dir);
  assert.equal(out.filesRecovered,0);
  assert.equal(out.failures.length,1);
  assert.equal(fs.existsSync(path.join(dir,'affiliate-results.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
