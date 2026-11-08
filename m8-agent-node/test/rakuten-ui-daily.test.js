import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseRakutenVisibleDailyTables,importRakutenVisibleDailyRows} from '../src/rakuten-ui-daily.js';
import {parseRakutenDailyCsv,mergeDailySnapshot} from '../src/rakuten-csv.js';

const header=['発生日','成果報酬','クリック数','売上件数','売上金額'];
const rows=[header,['合計','0','0','0','0'],
 ['2026-11-06','0','3','0','0'],
 ['2026-11-07','¥40','5','1','1,600'],
 ['2026-11-09','0','0','0','0'],
 ['2026-11-30','0','0','0','0'],
 ['合計','0','0','0','0'],header];
const now=Date.parse('2026-11-09T14:45:00Z');
test('parse only verified actual daily dates, never incomplete or future dates',()=>{
 const parsed=parseRakutenVisibleDailyTables([rows],{reportMonth:'2026-11',now});
 assert.deepEqual(parsed.map(x=>x.jstDate),['2026-11-06','2026-11-07']);
 assert.deepEqual(parsed[1],{jstDate:'2026-11-07',
  source:'rakuten_ui_period_daily',recordId:'ui-period:2026-11-07',
  rewardStatus:'provisional',rewardYen:40,clicks:5,
  salesCount:1,salesAmountYen:1600});
});
test('unverified HTML table cannot become affiliate evidence',()=>{
 assert.throws(()=>parseRakutenVisibleDailyTables([rows,rows],{reportMonth:'2026-11',now}),/daily_table_not_unique/);
 assert.throws(()=>parseRakutenVisibleDailyTables([rows],{reportMonth:'date',now}),/report_month_unverified/);
 assert.throws(()=>parseRakutenVisibleDailyTables([[header,['2026-11-07','0','private','0','0']]],{reportMonth:'2026-11',now}),/invalid_visible_metric/);
 assert.throws(()=>parseRakutenVisibleDailyTables([[header,['2026-11-07','0','0','0','0'],['2026-11-07','0','0','0','0']]],{reportMonth:'2026-11',now}),/duplicate_daily_row/);
 assert.throws(()=>parseRakutenVisibleDailyTables([[header,['2026-10-31','0','0','0','0']]],{reportMonth:'2026-11',now}),/invalid_daily_row_date/);
});
test('UI fallback never overwrites official CSV; official CSV replaces UI for same day',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-ui-daily-'));
 try{
  const ui=parseRakutenVisibleDailyTables([rows],{reportMonth:'2026-11',now});
  assert.equal(importRakutenVisibleDailyRows(dir,ui).daysUpdated,2);
  assert.equal(importRakutenVisibleDailyRows(dir,ui).daysUpdated,2);
  const ledger=path.join(dir,'affiliate-results.json');
  const initial=JSON.parse(fs.readFileSync(ledger,'utf8'));
  assert.equal(initial.records.length,2);
  const csv=parseRakutenDailyCsv('日付,クリック数,成果報酬,売上件数,売上金額\n2026/11/07,9,80,2,2000\n');
  const merged=mergeDailySnapshot(initial,csv);
  assert.equal(merged.records.length,2);
  assert.equal(merged.records.find(x=>x.jstDate==='2026-11-07').source,'rakuten_csv_period_daily');
  fs.writeFileSync(ledger,JSON.stringify(merged));
  const again=importRakutenVisibleDailyRows(dir,ui);
  assert.equal(again.daysUpdated,1);
  const after=JSON.parse(fs.readFileSync(ledger,'utf8')).records;
  assert.equal(after.length,2);
  assert.equal(after.find(x=>x.jstDate==='2026-11-07').rewardYen,80);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
