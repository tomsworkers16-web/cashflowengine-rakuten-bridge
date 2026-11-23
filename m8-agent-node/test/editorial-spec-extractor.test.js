import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEditorialSpecQuotes} from '../src/editorial-spec-extractor.js';
import {runEditorialPageVerifiedWorkflow} from '../src/editorial-page-verified-workflow.js';
import {rakutenEditorialEvidence} from '../src/editorial-rakuten-evidence.js';

const sample='<html><body><main>'+
 '<p>商品名 壁付きチェスト スリム ワイド 日本製 収納ケース</p>'+
 '<p>材質 ポリプロピレン 仕様 ●原産国：日本 ●組立品です ●組立時間：約20-30分</p>'+
 '<p>【スリムサイズ】 ●収納目安(引出し1段あたり): Yシャツなら約6枚'+
 ' ●引出し内寸: 幅26 奥行き36 深さ16cm ●耐荷重: 天板(約)2kg、引出し1段あたり(約)2kg</p>'+
 '<p>【ワイドサイズ】 ●収納目安(引出し1段あたり): Yシャツなら約8枚'+
 ' ●引出し内寸: 幅46 奥行き36 深さ16cm ●耐荷重: 天板(約)3kg、引出し1段あたり(約)3kg</p>'+
 '</main></body></html>';
test('extracts exact material, assembly and scoped dimensions',()=>{
 const r=extractEditorialSpecQuotes(sample);
 assert.equal(r.status,'spec_quotes_extracted');
 assert.equal(r.quotePlans.length,6);
 assert.match(r.quotePlans.find(x=>x.id==='slim_drawer_inner_dimensions').claim,/幅26×奥行36×深さ16/);
 assert.match(r.quotePlans.find(x=>x.id==='wide_drawer_inner_dimensions').claim,/幅46×奥行36×深さ16/);
 assert.match(r.quotePlans.find(x=>x.id==='slim_load_capacity').claim,/約2kg/);
 assert.match(r.quotePlans.find(x=>x.id==='wide_load_capacity').claim,/約3kg/);
});
test('does not attribute wide specs to slim variant',()=>{
 const html='<html><body><div>商品仕様の説明</div><p>【スリムサイズ】引出し内寸: 幅26 奥行き36 深さ16cm</p>'+
 '<p>【ワイドサイズ】引出し内寸: 幅46 奥行き36 深さ16cm '+('商品詳細 '.repeat(10))+'</p></body></html>';
 const r=extractEditorialSpecQuotes(html);
 assert.match(r.quotePlans.find(x=>x.id==='slim_drawer_inner_dimensions').quote,/幅26/);
 assert.match(r.quotePlans.find(x=>x.id==='wide_drawer_inner_dimensions').quote,/幅46/);
});
test('insufficient or invented specs never pass source verification',async()=>{
 const item={itemCode:'e-kurashi:10048736',itemName:'壁付き チェスト 収納',price:4999,rank:24,hasAffiliateUrl:true};
 const page='https://item.rakuten.co.jp/e-kurashi/s1u57/';
 const evidence=rakutenEditorialEvidence({Items:[{Item:{itemCode:item.itemCode,itemName:item.itemName,itemPrice:4999,
 itemUrl:page,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/demo/'}}]},item.itemCode,{checkedAt:'2026-11-20'});
 const r=await runEditorialPageVerifiedWorkflow({
  ranking:[item],apiEvidenceByItemCode:{[item.itemCode]:evidence},
  pageHtmlByItemCode:{[item.itemCode]:sample},checkedAt:'2026-11-20'
 });
 assert.equal(r.pageVerification[0].status,'page_quotes_matched');
 assert.equal(r.pageVerification[0].quoteSource,'pattern_extraction');
 assert.equal(r.pageVerification[0].quoteCount,6);
 assert.equal(r.summary.modelNotConnected,1);
 assert.equal(r.summary.reviewCandidates,0);
 assert.equal(r.summary.published,0);
});
test('bare title-only HTML provides no verified product specification',()=>{
 const r=extractEditorialSpecQuotes('<html><body><h1>幅34cm チェスト 大人気</h1></body></html>');
 assert.equal(r.status,'research_required');
 assert.equal(r.quotePlans.length,0);
});
