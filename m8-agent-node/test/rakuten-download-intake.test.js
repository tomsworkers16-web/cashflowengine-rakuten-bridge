import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {intakeRakutenDownloads} from '../src/rakuten-download-intake.js';
import {scanRakutenInbox} from '../src/rakuten-report-importer.js';
import {summarizeAffiliateDay} from '../src/revenue-metrics.js';

test('opt-in dedicated folder captures valid CSV once and imports daily Rakuten evidence',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-intake-'));
 try{
  const source=path.join(temp,'rakuten-downloads');
  const data=path.join(temp,'data');
  fs.mkdirSync(source);
  const file=path.join(source,'export.csv');
  fs.writeFileSync(file,'日付,クリック数,注文件数,成果報酬\n2026/11/05,13,2,140\n','utf8');
  const past=new Date(Date.now()-120000);
  fs.utimesSync(file,past,past);
  const first=intakeRakutenDownloads(data,source);
  assert.equal(first.enabled,true);
  assert.equal(first.accepted,1);
  const imported=scanRakutenInbox(data);
  assert.equal(imported.failures.length,0);
  const ledger=JSON.parse(fs.readFileSync(path.join(data,'affiliate-results.json'),'utf8'));
  const summary=summarizeAffiliateDay(ledger,'2026-11-05');
  assert.equal(summary.clicks,13);
  assert.equal(summary.orders,2);
  assert.equal(summary.rewardYen,140);
  assert.equal(summary.profitYen,'unknown');
  assert.equal(intakeRakutenDownloads(data,source).alreadyCaptured,1);
  assert.equal(fs.readdirSync(path.join(data,'rakuten-report-inbox')).length,1);
  assert.ok(fs.existsSync(file),'never remove or relocate source report');
 }finally{fs.rmSync(temp,{force:true,recursive:true,maxRetries:10,retryDelay:100});}
});

test('rejects malformed reports, incomplete recent downloads and disabled watch',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-intake-errors-'));
 try{
  const source=path.join(temp,'dedicated');
  const data=path.join(temp,'data');fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'unrelated.csv'),'password,email\nsecret,test@example.com\n');
  fs.writeFileSync(path.join(source,'fresh.csv'),'日付,クリック数\n2026/11/05,1\n');
  const past=new Date(Date.now()-120000);fs.utimesSync(path.join(source,'unrelated.csv'),past,past);
  assert.equal(intakeRakutenDownloads(data,undefined).enabled,false);
  const r=intakeRakutenDownloads(data,source);
  assert.equal(r.accepted,0);
  assert.equal(r.rejected,2);
  assert.equal(fs.existsSync(path.join(data,'rakuten-report-inbox')),false);
  assert.equal(intakeRakutenDownloads(data,path.join(temp,'missing')).sourceStatus,'unavailable');
 }finally{fs.rmSync(temp,{force:true,recursive:true,maxRetries:10,retryDelay:100});}
});
