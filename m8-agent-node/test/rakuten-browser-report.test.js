import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyRakutenReportPage,captureValidatedCsv} from '../src/rakuten-browser-report.js';
test('Rakuten official page and auth allowlist is strict',()=>{
 assert.equal(classifyRakutenReportPage('https://affiliate.rakuten.co.jp/report/'),'report');
 assert.equal(classifyRakutenReportPage('https://login.account.rakuten.com/sso/authorize'),'authentication_or_navigation');
 assert.equal(classifyRakutenReportPage('http://affiliate.rakuten.co.jp/report/'),'untrusted_origin');
 assert.equal(classifyRakutenReportPage('https://affiliate.rakuten.co.jp.evil.test/report/'),'untrusted_origin');
});
test('CSV export is validated and source file name is never used as a path',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-browser-export-'));
 try{
  const good=Buffer.from('日付,クリック数,注文件数,成果報酬\n2026/11/05,4,1,80\n','utf8');
  const result=captureValidatedCsv(dir,good,{filename:'../../secret.csv'});
  assert.equal(result.days,1);
  assert.equal(fs.readdirSync(dir).length,1);
  assert.match(result.filename,/^rakuten-period-/);
  assert.throws(()=>captureValidatedCsv(dir,Buffer.from('email,pass\nx,y\n')),/date_column_missing/);
  assert.equal(fs.readdirSync(dir).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
