import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectRejectedRakutenCsv} from '../src/rakuten-rejected-status.js';
import {buildLocalRevenueStatus} from '../src/revenue-status.js';

test('detects repeated Rakuten date placeholder without leaking report rows',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rejected-csv-status-'));
 try{
  const folder=path.join(dir,'rakuten-report-rejected');
  fs.mkdirSync(folder);
  const file=path.join(folder,'rejected-1793971163894-13028.csv');
  fs.writeFileSync(file,'期間別 日別\\"\\n\\n発生日,成果報酬,クリック数,売上件数,売上金額\\ndate,0,0,0,0\\n'.replace(/\\n/g,'\n'));
  const info=inspectRejectedRakutenCsv(dir);
  assert.equal(info.filesFound,1);
  assert.equal(info.latestStatus,'daily_date_value_invalid');
  assert.equal(info.nextStep,'inspect_rakuten_report_export');
  assert.ok(!JSON.stringify(info).includes('date,0,0'));
  const status=buildLocalRevenueStatus(dir,Date.parse('2026-11-06T13:00:00Z'));
  assert.match(status.nextAction,/日付値が無効/);
  assert.equal(status.sevenDay.daysReported,0);
  assert.equal(status.sevenDay.rakutenClicks,'unknown');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('no rejected CSVs never invents error or results',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-no-rejected-'));
 try{
  const info=inspectRejectedRakutenCsv(dir);
  assert.equal(info.filesFound,0);
  assert.equal(info.latestStatus,'none');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
