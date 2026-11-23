// Read-only inspection of the verified November 2026 Rakuten order CSV layout.
// The order report is not a product-click or profit ledger. Never convert it to one.
import { parseCsv } from './rakuten-csv.js';

const JA = ['発生日','成果報酬','料率','売上金額','ジャンル名','ショップ名','商品名','ステータス','リンクタイプ','デバイスタイプ','計測ID'];
const EN = ['date','rewards','rate','amount','genre_name','shop_name','item_name','status','link_type','device_type','measurement_id'];
const normalize = v => String(v ?? '').trim();
const equals = (row, header) => Array.isArray(row) && row.length === header.length && row.every((v,i)=>normalize(v)===header[i]);

export function auditRakutenOrderReport(csv) {
  const unavailable = reason => ({status:'order_report_unverified',reason,published:0});
  if (typeof csv !== 'string' || !csv.trim() || csv.length>5*1024*1024) return unavailable('invalid_input');
  let rows;
  try { rows=parseCsv(csv.replace(/^\uFEFF/,'')); } catch { return unavailable('invalid_csv'); }
  const title=rows[0]?.length===1?normalize(rows[0][0]):'';
  const period=title.match(/^注文別成果:\s*(20\d{2})\.(0?[1-9]|1[0-2])$/);
  if(!period) return unavailable('order_report_title_unverified');
  const positions=rows.map((row,i)=>equals(row,JA)&&equals(rows[i+1],EN)?i:-1).filter(i=>i>=0);
  if(positions.length!==1) return unavailable('bilingual_header_not_unique');
  const body=rows.slice(positions[0]+2);
  if(body.some(row=>row.length!==EN.length||equals(row,JA)||equals(row,EN))) return unavailable('unexpected_order_row_layout');
  // Actual nonempty row semantics remain unverified until a real sample is observed.
  const measurementIdPresent=body.filter(row=>{const v=normalize(row[10]);return v!==''&&v!=='-'&&v!=='－';}).length;
  return {status:body.length?'order_rows_present_semantics_unverified':'empty_order_report',
    reportMonth:period[1]+'-'+period[2].padStart(2,'0'),rowCount:body.length,
    measurementIdPresent,columnsVerified:true,
    available:['date','reportedReward','rate','salesAmount','genreName','shopName','itemName','status','linkType','deviceType','measurementId'],
    unavailable:['stableOrderRecordId','purchasedItemCode','productClicks','allocatedCost'],
    itemProfitEligible:false,attributionVerified:false,published:0};
}
