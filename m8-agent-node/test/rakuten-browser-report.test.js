import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyRakutenReportPage,captureValidatedCsv,isPeriodTabLabel,selectPeriodButtonIndices,isTransientNavigationError} from '../src/rakuten-browser-report.js';
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

test('period report tab identification is exact and excludes other report types',()=>{
 assert.equal(isPeriodTabLabel('期間別'),true);
 assert.equal(isPeriodTabLabel(' 期間別 '),true);
 assert.equal(isPeriodTabLabel('注文明細'),false);
 assert.equal(isPeriodTabLabel('成果報酬・確定実績'),false);
 assert.equal(isPeriodTabLabel('期間別CSVダウンロード'),false);
});

test('visible native button text maps to exact period tab even when accessible name differs',()=>{
 const buttons=[
  {index:0,text:'サマリ'},
  {index:1,text:'期間別'},
  {index:2,text:'成果報酬・確定実績'}
 ];
 assert.deepEqual(selectPeriodButtonIndices(buttons),[1]);
 assert.deepEqual(selectPeriodButtonIndices([{text:'期間別 CSV'},{text:'期間別レポート'}]),[]);
 assert.deepEqual(selectPeriodButtonIndices([{text:'期間別'},{text:'期間別'}]),[0,1]);
});

test('detects transient navigation context destruction without retrying other failures',()=>{
 assert.equal(isTransientNavigationError(new Error('locator.evaluateAll: Execution context was destroyed, most likely because of a navigation')),true);
 assert.equal(isTransientNavigationError(new Error('Frame was detached')),true);
 assert.equal(isTransientNavigationError(new Error('Timeout 20000ms exceeded')),false);
 assert.equal(isTransientNavigationError(new Error('CSV invalid')),false);
});
