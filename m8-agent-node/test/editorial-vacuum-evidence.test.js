import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeVacuumContainerPage} from '../src/editorial-vacuum-evidence.js';
import {runVacuumEvidence} from '../src/run-editorial-vacuum-evidence.js';
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
 assert.equal(fetched.length,2);
 assert.doesNotMatch(JSON.stringify(result),/APP_SECRET|KEY_SECRET|AFF_SECRET/);
});
