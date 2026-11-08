// Conservative fallback for authenticated Rakuten daily-table evidence when
// the official CSV contains invalid dates. Never infer values from headings.
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED=['発生日','成果報酬','クリック数','売上件数','売上金額'];
const JST_MS=9*3600000;
function norm(x){return String(x??'').normalize('NFKC').replace(/[\s　]/g,'').trim();}
function dateValue(x){
 const m=norm(x).match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})日?$/);
 if(!m)return null;
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 const check=new Date(Date.UTC(y,mo-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==mo||check.getUTCDate()!==d)return null;
 return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function integerYenOrCount(value){
 const s=norm(value).replace(/^[¥￥]/,'').replace(/[,，]/g,'');
 if(!/^\d+$/.test(s))throw Error('invalid_visible_metric');
 const valueNumber=Number(s);
 if(!Number.isSafeInteger(valueNumber)||valueNumber<0)throw Error('invalid_visible_metric');
 return valueNumber;
}
export function parseRakutenVisibleDailyTables(tables, {reportMonth,now=Date.now()}={}){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(reportMonth||''))throw Error('report_month_unverified');
 if(!Array.isArray(tables)||tables.length>20)throw Error('invalid_table_count');
 const matches=tables.filter(t=>Array.isArray(t)&&t.length>1 &&
  Array.isArray(t[0])&&t[0].length===5&&
  t[0].map(norm).every((h,i)=>h===EXPECTED[i]));
 if(matches.length!==1)throw Error('daily_table_not_unique');
 const table=matches[0];
 if(table.length>45)throw Error('too_many_daily_rows');
 const cutoff=new Date(now+JST_MS-86400000).toISOString().slice(0,10);
 const recordByDate=new Map();
 for(const row of table.slice(1)){
  if(!Array.isArray(row)||row.length!==5)throw Error('invalid_daily_row_width');
  const first=norm(row[0]);
  if(first==='合計'||first==='総計')continue;
  if(row.map(norm).every((v,i)=>v===EXPECTED[i]))continue; // repeated footer heading
  const day=dateValue(row[0]);
  if(!day||day.slice(0,7)!==reportMonth)throw Error('invalid_daily_row_date');
  if(recordByDate.has(day))throw Error('duplicate_daily_row');
  // Also validate future rows: malformed data is not allowed to silently hide.
  const values=row.slice(1).map(integerYenOrCount);
  recordByDate.set(day,{jstDate:day,source:'rakuten_ui_period_daily',
   recordId:'ui-period:'+day,rewardStatus:'provisional',
   rewardYen:values[0],clicks:values[1],salesCount:values[2],
   salesAmountYen:values[3]});
 }
 if(!recordByDate.size)throw Error('no_visible_daily_rows');
 const accepted=[...recordByDate.values()].filter(x=>x.jstDate<=cutoff);
 if(!accepted.length)throw Error('no_completed_daily_rows');
 return accepted;
}
export function importRakutenVisibleDailyRows(dataDir, rows){
 if(!Array.isArray(rows)||!rows.length||rows.some(x=>x.source!=='rakuten_ui_period_daily'))
  throw Error('invalid_ui_rows');
 const ledger=path.join(dataDir,'affiliate-results.json');
 const existing=fs.existsSync(ledger)
  ?JSON.parse(fs.readFileSync(ledger,'utf8')):{records:[]};
 if(!Array.isArray(existing.records))throw Error('invalid_ledger');
 const updated=new Map(rows.map(x=>[x.jstDate,x]));
 if(updated.size!==rows.length)throw Error('duplicate_ui_day');
 // A CSV is a preferred source. Never overwrite any independently confirmed
 // or manually entered result, or count a UI snapshot alongside it.
 for(const row of existing.records){
  if(updated.has(row.jstDate)&&row.source!=='rakuten_ui_period_daily')
   updated.delete(row.jstDate);
 }
 if(!updated.size)return {daysUpdated:0,source:'rakuten_ui_period_daily'};
 const current=existing.records.filter(x=>
  !(x.source==='rakuten_ui_period_daily'&&updated.has(x.jstDate)));
 const next={...existing,records:[...current,...updated.values()]};
 fs.mkdirSync(dataDir,{recursive:true});
 const temp=ledger+'.ui-import-tmp-'+process.pid;
 try{
  fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  fs.renameSync(temp,ledger);
 }finally{fs.rmSync(temp,{force:true});}
 return {daysUpdated:updated.size,source:'rakuten_ui_period_daily'};
}
