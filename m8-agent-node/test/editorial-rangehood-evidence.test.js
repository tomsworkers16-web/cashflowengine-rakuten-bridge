import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRangehoodFilterPage} from '../src/editorial-rangehood-evidence.js';
import {runRangehoodEvidence} from '../src/run-editorial-rangehood-evidence.js';
const title='スターフィルター スターターセット 強力マグネット+交換フィルター3枚';
const paragraphs='【主要なレンジフード機種名/型番】 レンジフードの機種名をご確認いただき、該当するサイズをお選びください。該当しない場合はサイズをご確認ください。 ※既存の金属フィルターと同数の専用枠をご注文ください。 ■専用枠 ＜ 200×250mm枠用 ＞ F254';
const html='<html><body>'+title+' '+paragraphs+'</body></html>';
test('mixed magnet kit and separate frames must hold rather than publish',()=>{
 const result=analyzeRangehoodFilterPage(html);
 assert.equal(result.status,'configuration_review_required');
 assert.equal(result.ambiguity,'magnet_set_and_separate_frame_guidance_on_same_page');
 assert.deepEqual(result.mentionedFrameSizes,['200×250mm']);
 assert.equal(result.articleEligible,false);
 assert.equal(result.published,0);
 assert.equal(result.evidence.filter(x=>x.found).length,4);
});
test('missing exact evidence never approves article',()=>{
 const result=analyzeRangehoodFilterPage('<html><body>レンジフード おすすめ</body></html>');
 assert.equal(result.status,'research_required');
 assert.equal(result.articleEligible,false);
});
test('official item API and product page inspect only, protect keys and do not post',async()=>{
 const fetchFn=async u=>{
  if(String(u).includes('openapi.rakuten.co.jp'))return {ok:true,json:async()=>({
    Items:[{Item:{itemCode:'starfilter:10000112',itemUrl:'https://item.rakuten.co.jp/starfilter/sfsetm03/',
    itemName:title,itemPrice:3080,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/'}}]
  })};
  if(String(u)==='https://item.rakuten.co.jp/starfilter/sfsetm03/')return {
   ok:true,headers:{get:k=>k==='content-type'?'text/html; charset=utf-8':null},
   arrayBuffer:async()=>Buffer.from(html,'utf8')
  };
  throw Error('unexpected');
 };
 const result=await runRangehoodEvidence({applicationId:'APP_SECRET',accessKey:'ACCESS_SECRET',affiliateId:'AFF_SECRET',fetchFn});
 assert.equal(result.status,'configuration_review_required');
 assert.equal(result.productPageUrl,'https://item.rakuten.co.jp/starfilter/sfsetm03/');
 assert.equal(result.published,0);
 assert.equal(result.publishApproved,false);
 assert.doesNotMatch(JSON.stringify(result),/APP_SECRET|ACCESS_SECRET|AFF_SECRET/);
});
