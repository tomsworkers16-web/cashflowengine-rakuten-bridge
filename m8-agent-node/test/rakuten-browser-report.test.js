import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyRakutenReportPage,captureValidatedCsv,isPeriodTabLabel,selectPeriodButtonIndices,isTransientNavigationError,exactButtonIndices,exactCsvLinkIndices,isSafeRakutenExportLink,diagnoseRakutenCaptureFailure,summarizeRakutenCsvSchema,summarizeVisibleReportDayCells} from '../src/rakuten-browser-report.js';
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

test('a CSV date column with placeholder text has a distinct safe diagnostic',()=>{
 const result=diagnoseRakutenCaptureFailure(new Error('invalid_date_row_2: hidden account text'),'validate_downloaded_csv');
 assert.deepEqual(result,{stage:'validate_downloaded_csv',code:'daily_report_date_values_invalid'});
 assert.ok(!JSON.stringify(result).includes('hidden account'));
});

test('rejected CSV schema reveals only structural hints, not rows or earnings',()=>{
 const csv='日別,クリック合計,注文件数,成果報酬\n2026/11/05,12345,2,500\n';
 const summary=summarizeRakutenCsvSchema(Buffer.from(csv,'utf8'));
 assert.equal(summary.encoding,'utf-8');
 assert.equal(summary.firstRowColumns,4);
 assert.equal(summary.possibleHeaderRow,1);
 assert.equal(summary.firstRowLabels.length,4);
 assert.equal(JSON.stringify(summary).includes('12345'),false);
 assert.equal(JSON.stringify(summary).includes('2026/11/05'),false);
 const tab=summarizeRakutenCsvSchema(Buffer.from('日付\tクリック数\t成果報酬\n2026/11/05\t2\t50'));
 assert.equal(tab.delimiter,'tab');
 assert.equal(tab.firstRowColumns,3);
});

test('read-only report inspection counts only date-like first cells without showing finance fields',()=>{
 const summary=summarizeVisibleReportDayCells([
  '2026/11/01','2026/11/02','2026年11月3日','11/04',
  '10,000円','account_name','2026/11/01','date'
 ]);
 assert.deepEqual(summary,{visibleDateRowCount:4,hasDatedRows:true});
 assert.deepEqual(summarizeVisibleReportDayCells(['date','売上金額','0']),{
  visibleDateRowCount:0,hasDatedRows:false
 });
 assert.ok(!JSON.stringify(summary).includes('account_name'));
});

test('read-only inspection classifies CSV link shape without exposing signed URLs',()=>{
 const urls=[
  {visible:true,text:'CSV',href:'https://affiliate.rakuten.co.jp/report/?token=SECRET'},
 ];
 const result=classifyExportLinkShape(urls);
 assert.deepEqual(result,{
  csvLinkCount:1,exportLinkShape:'official_absolute_url',exportLinkTrusted:true
 });
 assert.ok(!JSON.stringify(result).includes('SECRET'));
 assert.equal(classifyExportLinkShape([{visible:true,text:'CSV',href:'#'}]).exportLinkShape,'fragment_or_script');
 assert.equal(classifyExportLinkShape([{visible:true,text:'CSV',href:'/report/export'}]).exportLinkShape,'relative_path');
 assert.equal(classifyExportLinkShape([{visible:true,text:'CSV',href:'https://evil.example/report.csv'}]).exportLinkTrusted,false);
 assert.equal(classifyExportLinkShape([]).exportLinkShape,'unverified');
 assert.equal(classifyExportLinkShape([...urls,...urls]).csvLinkCount,2);
});
