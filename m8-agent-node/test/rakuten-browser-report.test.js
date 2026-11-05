import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyRakutenReportPage,captureValidatedCsv,isPeriodTabLabel,selectPeriodButtonIndices,isTransientNavigationError,exactButtonIndices,exactCsvLinkIndices,isSafeRakutenExportLink,diagnoseRakutenCaptureFailure} from '../src/rakuten-browser-report.js';
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

test('guarded daily report export buttons must be uniquely matched and enabled',()=>{
 const buttons=[{text:'日別',disabled:false},{text:'月別',disabled:false},
  {text:'ダウンロード',disabled:false},{text:'ダウンロード',disabled:true}];
 assert.deepEqual(exactButtonIndices(buttons,'日別'),[0]);
 assert.deepEqual(exactButtonIndices(buttons,'ダウンロード'),[2]);
 assert.deepEqual(exactButtonIndices(buttons,'CSV'),[]);
 assert.deepEqual(exactButtonIndices([{text:'ダウンロード'},{text:'ダウンロード'}],'ダウンロード'),[0,1]);
});

test('CSV export submenu only selects one visible exact CSV anchor',()=>{
 const links=[
  {index:0,text:'ヘルプ',visible:true},
  {index:1,text:'CSV',visible:true,href:'#'},
  {index:2,text:'CSV',visible:false,href:'#'}
 ];
 assert.deepEqual(exactCsvLinkIndices(links),[1]);
 assert.deepEqual(exactCsvLinkIndices([{text:'CSVデータ',visible:true}]),[]);
 assert.deepEqual(exactCsvLinkIndices([
  {text:'CSV',visible:true},{text:'CSV',visible:true}
 ]),[0,1]);
});
test('CSV download link must stay on official Rakuten report origin',()=>{
 assert.equal(isSafeRakutenExportLink('#'),true);
 assert.equal(isSafeRakutenExportLink('/report/download'),true);
 assert.equal(isSafeRakutenExportLink('https://affiliate.rakuten.co.jp/report/'),true);
 assert.equal(isSafeRakutenExportLink('javascript:alert(1)'),false);
 assert.equal(isSafeRakutenExportLink('https://affiliate.rakuten.co.jp.evil.test/report/'),false);
 assert.equal(isSafeRakutenExportLink('http://affiliate.rakuten.co.jp/report/'),false);
});

test('safe report diagnostics identify stage and errors without leaking private data',()=>{
 const failure=diagnoseRakutenCaptureFailure(new Error(
  'date_column_missing: user token=secret; C:\\Users\\private\\Downloads'), 'validate_downloaded_csv');
 assert.deepEqual(failure,{stage:'validate_downloaded_csv',code:'downloaded_csv_format_not_supported'});
 assert.equal(JSON.stringify(failure).includes('secret'),false);
 assert.equal(diagnoseRakutenCaptureFailure(new Error('locator.click: Timeout 18000ms exceeded'),'click_csv_link').code,'timeout');
 assert.equal(diagnoseRakutenCaptureFailure(new Error('Unrecognized unknown problem'),'save_download_file').code,'unclassified');
 assert.equal(diagnoseRakutenCaptureFailure(new Error('EACCES: permission denied'),'save_download_file').code,'local_file_access');
});
