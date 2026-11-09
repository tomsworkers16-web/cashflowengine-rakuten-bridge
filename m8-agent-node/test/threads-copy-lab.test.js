import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDraft,createRevenueCopyHypotheses} from '../src/threads-copy-lab.js';
const url='https://hb.afl.rakuten.co.jp/hgc/example/?pc=exact%3Aoriginal';
test('three distinct non-posting alternatives preserve disclosure, exact link and price',()=>{
 const result=createRevenueCopyHypotheses({itemName:'【送料無料】 洗面台 ヘアーキャッチャー 排水口 ゴミ受け',
  price:1980,affiliateUrl:url});
 assert.equal(result.status,'offline_draft_only');
 assert.deepEqual(result.drafts.map(x=>x.id),['problem_question','buyer_checklist','product_identity']);
 for(const row of result.drafts){
  assert.equal(row.audit.eligibleForManualReview,true,row.audit.failures.join(','));
  assert.ok(row.text.startsWith('【PR】'));
  assert.ok(row.text.endsWith(url));
  assert.ok(row.text.includes('1,980'));
  assert.ok(row.text.length<=500);
  assert.doesNotMatch(row.text,/使ってみた|最安|爆売れ/);
 }
 assert.equal(new Set(result.drafts.map(x=>x.text)).size,3);
});
test('unsupported effectiveness and fake first-person claims are rejected',()=>{
 assert.deepEqual(auditDraft('【PR】\n使ってみた！必ず効果あり\n'+url,
  {affiliateUrl:url,revenue:true}).failures,['unverified_product_claim']);
});
test('long affiliate URLs are unmodified even when body must be shortened',()=>{
 const long='https://hb.afl.rakuten.co.jp/hgc/test?pc='+ 'x'.repeat(395);
 const result=createRevenueCopyHypotheses({itemName:'収納ラック',price:3960,affiliateUrl:long});
 assert.equal(result.drafts.length,3);
 for(const row of result.drafts){
  assert.ok(row.text.endsWith(long));
  assert.equal(row.audit.eligibleForManualReview,true,row.audit.failures.join(','));
  assert.ok(row.text.length<=500);
 }
});
test('missing products or links never generate drafts',()=>{
 assert.equal(createRevenueCopyHypotheses({itemName:'収納ラック'}).status,'ineligible');
 assert.equal(createRevenueCopyHypotheses({itemName:'収納ラック',affiliateUrl:'http://invalid'}).drafts.length,0);
});
