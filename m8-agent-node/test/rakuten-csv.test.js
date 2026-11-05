import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRakutenDailyCsv, mergeDailySnapshot,parseCsv} from '../src/rakuten-csv.js';

test('reads day-level Japanese Rakuten report with quoted currency and total line',()=>{
  const rows=parseRakutenDailyCsv('\uFEFF日付,クリック数,注文件数,成果報酬額\r\n2026/11/04,"1,200",2,"¥160"\r\n2026/11/05,0,0,0\r\n合計,1200,2,160\r\n');
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{jstDate:'2026-11-04',source:'rakuten_csv_period_daily',recordId:'period:2026-11-04',rewardStatus:'provisional',clicks:1200,orders:2,rewardYen:160});
  assert.equal(rows[1].rewardYen,0);
});

test('accepts legitimate quoted comma and newlines, rejects malformed quotes',()=>{
  assert.deepEqual(parseCsv('a,b\n"X,Y","line1\nline2"\n'),[['a','b'],['X,Y','line1\nline2']]);
  assert.throws(()=>parseCsv('"unfinished'),/unterminated_csv_quote/);
});

test('does not assume unprovided counts or rewards are zero',()=>{
  const rows=parseRakutenDailyCsv('日付,クリック数\n2026年11月05日,5\n');
  assert.equal(rows[0].clicks,5);
  assert.equal(Object.hasOwn(rows[0],'orders'),false);
  assert.equal(Object.hasOwn(rows[0],'rewardYen'),false);
});

test('rejects order-detail CSV, invalid and duplicate dates rather than producing false totals',()=>{
  assert.throws(()=>parseRakutenDailyCsv('注文番号,報酬額\nX001,50\n'),/date_column_missing/);
  assert.throws(()=>parseRakutenDailyCsv('日付,クリック数\n2026/02/30,3\n'),/invalid_date/);
  assert.throws(()=>parseRakutenDailyCsv('日付,クリック数\n2026/11/05,3\n2026/11/05,8\n'),/duplicate_day/);
});

test('a repeated daily export replaces the earlier snapshot rather than adding it',()=>{
  const a=parseRakutenDailyCsv('日付,クリック数,成果報酬額\n2026/11/05,10,30\n');
  const b=parseRakutenDailyCsv('日付,クリック数,成果報酬額\n2026/11/05,12,40\n');
  const result=mergeDailySnapshot(mergeDailySnapshot(null,a),b);
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].clicks,12);
  assert.equal(result.records[0].rewardYen,40);
});

test('refuses other data sources for the same date rather than double counting',()=>{
  assert.throws(()=>mergeDailySnapshot({records:[{source:'rakuten_dashboard',jstDate:'2026-11-05',rewardYen:60}]},
    [{source:'rakuten_csv_period_daily',jstDate:'2026-11-05',rewardYen:60}]),/conflicting_non_csv/);
});

test('accepts one report-title preamble before five Rakuten daily columns',()=>{
 const csv='期間別レポート（日別）\n発生日,成果件数,クリック数,売上金額,成果報酬\n2026/11/05,2,3,1200,50\n';
 const rows=parseRakutenDailyCsv(csv);
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0],{
  jstDate:'2026-11-05',source:'rakuten_csv_period_daily',
  recordId:'period:2026-11-05',rewardStatus:'provisional',
  clicks:3,orders:2,rewardYen:50
 });
});
test('does not infer rewards from sales and rejects unsafe ambiguous preambles',()=>{
 const rows=parseRakutenDailyCsv('楽天レポート\n発生日,成果件数,クリック数,売上金額,売上件数\n2026/11/05,1,4,9000,2\n');
 assert.equal(rows.length,1);
 assert.equal(rows[0].clicks,4);
 assert.equal(rows[0].orders,1);
 assert.equal(Object.hasOwn(rows[0],'rewardYen'),false);
 assert.throws(()=>parseRakutenDailyCsv('楽天レポート\n発生日,売上金額\n2026/11/05,5000\n'),/date_column_missing/);
 assert.throws(()=>parseRakutenDailyCsv('タイトル\n注文明細,注文番号,金額\n2026/11/05,X1,500\n'),/date_column_missing/);
});

test('parses confirmed Rakuten title plus blank line and five-column header',()=>{
 const input='期間別レポート 日別 "テスト\n\n発生日,成果報酬,クリック数,売上件数,売上金額\n2026/11/05,80,3,1,1400\n';
 const rows=parseRakutenDailyCsv(input);
 assert.equal(rows.length,1);
 assert.equal(rows[0].jstDate,'2026-11-05');
 assert.equal(rows[0].rewardYen,80);
 assert.equal(rows[0].clicks,3);
 assert.equal(Object.hasOwn(rows[0],'orders'),false);
});
test('unverified metadata never bypasses strict invalid quote handling',()=>{
 assert.throws(()=>parseRakutenDailyCsv('自由なタイトル "開始\n\n発生日,売上金額\n2026/11/05,1400\n'),/invalid_csv_quotes/);
 assert.throws(()=>parseRakutenDailyCsv('楽天レポート\n\n発生日,成果報酬,クリック数,売上金額,売上件数\n2026/11/05,5"0,2,1400,1\n'),/invalid_csv_quotes/);
});

test('actual Rakuten columns preserve sales and reward as distinct metrics',()=>{
 const csv='期間別レポート\n\n発生日,成果報酬,クリック数,売上件数,売上金額\n2026/11/05,80,3,1,1400\n';
 const row=parseRakutenDailyCsv(csv)[0];
 assert.equal(row.rewardYen,80);
 assert.equal(row.salesCount,1);
 assert.equal(row.salesAmountYen,1400);
 assert.equal(row.clicks,3);
 assert.equal(Object.hasOwn(row,'orders'),false);
});
