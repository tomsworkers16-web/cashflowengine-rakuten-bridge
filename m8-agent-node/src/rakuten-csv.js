// Strict, offline importer for Rakuten *period-by-day* reports, not order-detail exports.
// Rakuten CSV headings may change. Unknown/missing metrics remain unknown.
const HEADERS = {
  day: ['日付','年月日','成果発生日','発生日','date','day'],
  clicks: ['クリック数','クリック','clicks'],
  orders: ['注文件数','注文数','成果件数','発生成果件数','orders'],
  rewardYen: ['成果報酬','成果報酬額','発生成果報酬','報酬額','報酬','rewardYen'],
  salesCount: ['売上件数'],
  salesAmountYen: ['売上金額'],
};
function norm(x) {return String(x ?? '').replace(/^\uFEFF/,'').normalize('NFKC').trim().replace(/[\s　]/g,'').toLowerCase();}
export function parseCsv(csv) {
  const rows=[];let row=[];let field='';let quoted=false;
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quoted){
      if(c==='"' && csv[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quoted=false;else field+=c;
    } else {
      if(c==='"'){if(field)throw Error('invalid_csv_quotes');quoted=true;}
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'||c==='\r'){
        if(c==='\r'&&csv[i+1]==='\n')i++;
        row.push(field);field='';
        if(row.some(v=>v.trim()))rows.push(row);
        row=[];
      }else field+=c;
    }
  }
  if(quoted)throw Error('unterminated_csv_quote');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
function dateValue(x){
  const s=String(x||'').trim().normalize('NFKC');
  const m=s.match(/^(\d{4})(?:[\/-]|年)(\d{1,2})(?:[\/-]|月)(\d{1,2})日?$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(!m)return null;
  const year=+m[1],month=+m[2],day=+m[3];
  const valid=new Date(Date.UTC(year,month-1,day));
  if(valid.getUTCFullYear()!==year||valid.getUTCMonth()!==month-1||valid.getUTCDate()!==day)return null;
  return [m[1],String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
}
function nonnegative(x,label){
  const raw=String(x??'').trim().normalize('NFKC').replace(/[¥￥,，\s]/g,'');
  if(raw==='' || raw==='-' || raw==='－')return null;
  if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('invalid_'+label);
  const v=Number(raw);
  if(!Number.isFinite(v))throw Error('invalid_'+label);
  // Counts cannot be fractional and monetary fields represent yen.
  // Reject silent rounding or unsafe integer precision in the ledger.
  if(['clicks','orders','salesCount','rewardYen','salesAmountYen'].includes(label)
    && (!Number.isSafeInteger(v)||v<0))
    throw Error('invalid_'+label);
  return v;
}
// Rakuten's exported day report may include a free-form title (occasionally
// containing an unescaped quote), then an empty line and its real CSV header.
// Identify the report by exact supported column labels before ignoring metadata.
// Never relax CSV quote validation for the actual header or data records.
export function stripVerifiedDailyReportPreamble(csv) {
 const lines=csv.split(/\r\n|\n|\r/);
 if(lines.length<3||lines[0].length>300||lines[0].includes(','))return csv;
 for(let i=1;i<=Math.min(3,lines.length-2);i++){
  if(lines.slice(1,i).some(line=>line.trim()))break;
  let cells;
  try{cells=parseCsv(lines[i])[0]||[];}catch{continue;}
  if(cells.length<3||cells.length>30)continue;
  const normalized=cells.map(norm);
  const count=(key)=>normalized.filter(h=>HEADERS[key].some(alias=>norm(alias)===h)).length;
  if(count('day')!==1)continue;
  if(['clicks','orders','rewardYen'].filter(key=>count(key)===1).length<2)continue;
  // Prefer a known five-column layout, but preserve legacy header variants
  // once date and two metric labels are exact matches.
  const candidate=lines.slice(i).join('\n');
  if(candidate) return candidate;
 }
 return csv;
}
export function parseRakutenDailyCsv(csv) {
  if(typeof csv!=='string'||!csv.trim()||csv.length>5*1024*1024)throw Error('invalid_csv_size');
  const rows=parseCsv(stripVerifiedDailyReportPreamble(csv));
  if(rows.length<2)throw Error('no_data_rows');
  // Rakuten may prepend a one-cell title (e.g. report name) above the
  // five-column daily data header. Only skip a *single* title row if the
  // next row has an unambiguous date column and at least one supported metric.
  // Never guess at sales amounts or infer monetary meaning from column order.
  let headerRow=0;
  const canBeDailyHeader=(cells)=>{
   const names=cells.map(norm);
   const keys=Object.entries(HEADERS).map(([key,aliases])=>({
    key,matches:names.filter(h=>aliases.map(norm).includes(h)).length
   }));
   return keys.find(x=>x.key==='day')?.matches===1 &&
    keys.filter(x=>x.key!=='day').some(x=>x.matches===1);
  };
  if(rows[0].length===1&&rows.length>=3&&canBeDailyHeader(rows[1]))
   headerRow=1;
  const header=rows[headerRow].map(norm);
  const idx={};
  for(const [key,aliases]of Object.entries(HEADERS)){
    const matches=header.map((h,i)=>aliases.map(norm).includes(h)?i:-1).filter(i=>i>=0);
    if(matches.length>1)throw Error('ambiguous_column_'+key);
    idx[key]=matches.length===1?matches[0]:-1;
  }
  if(idx.day<0)throw Error('date_column_missing');
  if(['clicks','orders','rewardYen'].every(key=>idx[key]<0))throw Error('no_supported_metrics');
  const byDay=new Map();
  for(let i=headerRow+1;i<rows.length;i++){
    const cells=rows[i];
    if(cells.length!==header.length)throw Error('csv_column_count_mismatch_row_'+(i+1));
    const rawDate=cells[idx.day];
    const date=dateValue(rawDate);
    // Summary/footer rows are skipped; malformed date-looking rows are rejected.
    if(!date){
      if(/合計|総計|total/i.test(String(rawDate)))continue;
      throw Error('invalid_date_row_'+(i+1));
    }
    if(byDay.has(date))throw Error('duplicate_day_in_csv_'+date);
    const out={jstDate:date,source:'rakuten_csv_period_daily',recordId:'period:'+date,rewardStatus:'provisional'};
    for(const key of ['clicks','orders','rewardYen','salesCount','salesAmountYen']){
      if(idx[key]>=0){
        const value=nonnegative(cells[idx[key]],key);
        if(value!==null)out[key]=value;
      }
    }
    byDay.set(date,out);
  }
  if(!byDay.size)throw Error('no_valid_daily_rows');
  return [...byDay.values()];
}
export function mergeDailySnapshot(existing, incoming) {
  const records=Array.isArray(existing?.records)?existing.records:[];
  const updated=new Map(incoming.map(r=>[r.jstDate,r]));
  for(const row of records){
    if(updated.has(row.jstDate)&&row.source!=='rakuten_csv_period_daily'
      &&row.source!=='rakuten_ui_period_daily')
      throw Error('conflicting_non_csv_results_for_'+row.jstDate);
  }
  // Valid official CSV supersedes provisional authenticated UI fallback
  // for the same date; never double-count the two source snapshots.
  return {records:[...records.filter(r=>!(
   ['rakuten_csv_period_daily','rakuten_ui_period_daily'].includes(r.source)
   &&updated.has(r.jstDate))),...incoming]};
}
