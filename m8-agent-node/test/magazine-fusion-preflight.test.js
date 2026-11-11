import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMatchedCreativeReview} from '../src/magazine-fusion-preflight.js';
const url='https://hb.afl.rakuten.co.jp/hgc/tracking/?pc=encoded';
const draft=body=>({text:'【PR】\n\n'+body+'\n\n気になる方はこちら：シンク上の水切りラック\n\n購入前にサイズ・仕様・価格・送料を確認してください。\n\n'+url,review:{warnings:[]}});
test('compact review confirms both drafts use the same item but never grants permission',()=>{
 const packet={status:'creatives_ready_for_review',productItemCode:'shop:123',comparisonType:'same_item_different_editorial_angle',arms:[
 {arm:'baseline',itemCode:'shop:123',evidenceLinks:[],draft:draft('水切りラックのサイズを確認しましょう。')},
 {arm:'fusion',itemCode:'shop:123',evidenceLinks:[{url:'https://example.org/a'}],draft:draft('調理スペースを空けたい日は、上の空間を見直しましょう。')}
 ]};
 const r=summarizeMatchedCreativeReview(packet);
 assert.equal(r.status,'manual_editorial_review_required');
 assert.equal(r.distinctEditorialAngles,true);assert.equal(r.itemCode,'shop:123');
 assert.equal(r.results.length,2);assert.ok(r.results.every(x=>x.postSafeShape&&x.remainingCharacters>0));
 assert.equal(r.publicationAllowed,false);
 assert.ok(!JSON.stringify(r).includes(url));
});
test('rejects missing evidence packet, duplicate prose and unbound item code',()=>{
 assert.equal(summarizeMatchedCreativeReview({status:'insufficient_external_evidence'}).status,'not_ready');
 const packet={status:'creatives_ready_for_review',productItemCode:'shop:1',arms:[
 {arm:'baseline',itemCode:'shop:1',evidenceLinks:[],draft:draft('同じ本文')},
 {arm:'fusion',itemCode:'shop:1',evidenceLinks:[],draft:draft('同じ本文')}
 ]};
 assert.equal(summarizeMatchedCreativeReview(packet).status,'not_ready');
 packet.arms[1].itemCode='shop:2';
 assert.equal(summarizeMatchedCreativeReview(packet).reason,'item_binding_or_missing_draft');
});
