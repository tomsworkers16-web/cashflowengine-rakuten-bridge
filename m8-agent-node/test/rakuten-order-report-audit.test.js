import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRakutenOrderReport as audit} from '../src/rakuten-order-report-audit.js';
const header='発生日,成果報酬,料率,売上金額,ジャンル名,ショップ名,商品名,ステータス,リンクタイプ,デバイスタイプ,計測ID\ndate,rewards,rate,amount,genre_name,shop_name,item_name,status,link_type,device_type,measurement_id';
const report='\uFEFF"注文別成果: 2026.11"\n\nステータス,リンクタイプ,,,,,デバイスタイプ\n"0 - 未確定","0 - その他",,,,,\n\n'+header+'\n';
test('verified header-only export is valid but has no reported orders',()=>{
 const r=audit(report);assert.equal(r.status,'empty_order_report');assert.equal(r.rowCount,0);assert.equal(r.reportMonth,'2026-11');assert.equal(r.itemProfitEligible,false);
});
test('legend rows never become actual orders',()=>assert.equal(audit(report).rowCount,0));
test('nonempty synthetic row is detected without reporting revenue or identity',()=>{
 const r=audit(report+'2026-11-01,100,3,3000,genre,shop,product,1,1,3,example-id\n');
 assert.equal(r.rowCount,1);assert.equal(r.measurementIdPresent,1);assert.equal(r.status,'order_rows_present_semantics_unverified');assert.equal(r.attributionVerified,false);assert.ok(!JSON.stringify(r).includes('example-id'));
});
test('missing tracking ID does not imply attribution',()=>assert.equal(audit(report+'2026-11-01,100,3,3000,genre,shop,product,1,1,3,\n').measurementIdPresent,0));
test('different report or missing bilingual header is rejected',()=>{
 assert.equal(audit(report.replace('注文別成果','期間別成果')).status,'order_report_unverified');
 assert.equal(audit(report.replace('measurement_id','other')).status,'order_report_unverified');
});
test('unexpected row layout is not reported as orders',()=>assert.equal(audit(report+'foo,bar\n').status,'order_report_unverified'));
