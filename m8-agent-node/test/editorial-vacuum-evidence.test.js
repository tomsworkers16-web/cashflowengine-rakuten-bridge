import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeVacuumContainerPage} from '../src/editorial-vacuum-evidence.js';
import {runVacuumEvidence} from '../src/run-editorial-vacuum-evidence.js';
import {buildVacuumBuyerReviewDraft} from '../src/editorial-vacuum-buyer-guide.js';
import {extractVacuumSizeChart} from '../src/editorial-vacuum-size-chart.js';
const html='<html><body><main>VAKUEN 真空保存容器 商品情報 '+
 '単品でご購入の場合、自動真空ポンプは付属しません。 '+
 'Q5. 電子レンジに使えますか？ 500～600W・2分以内の温めのみ可。 '+
 '油分の多い食材のレンジ温めは破損の恐れがあるため絶対にお控えください。 '+
 '食洗機で洗えますか？ 標準モードのみ使用可能です。（※真空ポンプ本体は水洗い不可） '+
 '液体の保存は容量の80%以下で。 '+
 'ガスを多く排出する食材の真空保存は推奨しておりません。 '+
 '耐熱温度-30℃～100℃。</main></body></html>';
test('all literal cautions detected but individual SKU still held',()=>{
 const result=analyzeVacuumContainerPage(html);
 assert.equal(result.foundCount,8);
 assert.equal(result.status,'variant_review_required');
 assert.equal(result.articleEligible,false);
 assert.equal(result.published,0);
 assert.equal(result.missingRequired.length,0);
});
test('title keywords never count as safe handling evidence',()=>{
 const result=analyzeVacuumContainerPage('<html><body>VAKUEN 真空 食洗機 レンジ 冷凍 食品保存容器</body></html>');
 assert.equal(result.foundCount,0);
 assert.equal(result.status,'product_conditions_incomplete');
 assert.equal(result.articleEligible,false);
});
test('official item API -> exact product page, no secrets, no posts',async()=>{
 const fetched=[];
 const fetchFn=async url=>{
  fetched.push(String(url));
  if(String(url).includes('openapi.rakuten.co.jp'))return {ok:true,json:async()=>({Items:[{Item:{
   itemCode:'kitchenavi:10000408',itemName:'VAKUEN 真空保存容器',
   itemPrice:3480,itemUrl:'https://item.rakuten.co.jp/kitchenavi/2498-001010/',
   affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test'
  }}]})};
  if(String(url)==='https://item.rakuten.co.jp/kitchenavi/2498-001010/')return {
   ok:true,headers:{get:k=>k==='content-type'?'text/html; charset=utf-8':null},
   arrayBuffer:async()=>Buffer.from(html,'utf8')
  };
  throw Error('unexpected_url');
 };
 const result=await runVacuumEvidence({
  applicationId:'APP_SECRET',accessKey:'KEY_SECRET',affiliateId:'AFF_SECRET',fetchFn
 });
 assert.equal(result.status,'variant_review_required');
 assert.equal(result.productPageUrl,'https://item.rakuten.co.jp/kitchenavi/2498-001010/');
 assert.equal(result.published,0);
 assert.equal(result.publishApproved,false);
 assert.equal(result.draftStatus,'editorial_review_draft');
 assert.match(result.reviewDraft,/単品でご購入の場合、自動真空ポンプは付属しません/);
 assert.match(result.reviewDraft,/500〜600W・2分以内/);
 assert.match(result.reviewDraft,/容量の80%以下/);
 assert.match(result.reviewDraft,/商品選択肢の確認待ち/);
 assert.equal(fetched.length,2);
 assert.doesNotMatch(JSON.stringify(result),/APP_SECRET|KEY_SECRET|AFF_SECRET/);
});

test('evidence missing even one buyer caution prevents a guide draft',()=>{
 const r=analyzeVacuumContainerPage(html.replace('単品でご購入の場合、自動真空ポンプは付属しません。',''));
 const draft=buildVacuumBuyerReviewDraft(r,{sourceUrl:'https://item.rakuten.co.jp/kitchenavi/2498-001010/',checkedAt:'2026-11-20'});
 assert.equal(draft.status,'research_required');
 assert.equal(draft.reviewDraft,null);
 assert.equal(draft.published,0);
});
test('no product page URL or date means no draft even with seven cautions',()=>{
 const r=analyzeVacuumContainerPage(html);
 assert.equal(buildVacuumBuyerReviewDraft(r,{sourceUrl:'https://example.com/fake',checkedAt:'2026-11-20'}).reviewDraft,null);
 assert.equal(buildVacuumBuyerReviewDraft(r,{sourceUrl:'https://item.rakuten.co.jp/kitchenavi/2498-001010/'}).reviewDraft,null);
});


test('draft uses a sourced catalogue size chart without claiming selected option',()=>{
 const sizePage='<html><body>サイズ（横×奥行×高さ） ◆MINI ・0.3L 108×108×69 ・0.5L 167×108×69 ・0.8L 168×168×69 ◆BASIC ・0.5L 108×108×106 ・1.0L 167×108×101 ・1.4L 168×168×102 素材 AS樹脂</body></html>';
 const review=analyzeVacuumContainerPage(html);
 const draft=buildVacuumBuyerReviewDraft(review,{
  sourceUrl:'https://item.rakuten.co.jp/kitchenavi/2498-001010/',
  checkedAt:'2026-11-20',
  sizeChart:extractVacuumSizeChart(sizePage)
 });
 assert.equal(draft.status,'editorial_review_draft');
 assert.match(draft.reviewDraft,/MINI：0.3L/);
 assert.match(draft.reviewDraft,/BASIC：0.5L/);
 assert.match(draft.reviewDraft,/販売オプションやセット内容を保証するものではありません/);
 assert.equal(draft.publishApproved,false);
 assert.equal(draft.published,0);
});
