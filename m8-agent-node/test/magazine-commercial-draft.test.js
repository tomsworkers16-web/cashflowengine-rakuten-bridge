import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMagazineCommercialDraft} from '../src/magazine-commercial-draft.js';
const product={itemCode:'shop:1',itemName:'水切りラック',affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/example/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2F1'};
test('commercial preview keeps disclosure and original link, never authorizes publication',()=>{
 const x=prepareMagazineCommercialDraft({article:'洗い物が多い日は、水切りの場所を考えてみませんか？',product});
 assert.equal(x.status,'manual_review_required');assert.ok(x.text.startsWith('【PR】'));assert.ok(x.text.endsWith(product.affiliateUrl));assert.equal(x.publicationAllowed,false);
});
test('invalid or oversized copy is never silently truncated',()=>{
 assert.equal(prepareMagazineCommercialDraft({article:'使ってみた。',product}).status,'article_rejected');
 assert.equal(prepareMagazineCommercialDraft({article:'あ'.repeat(450),product}).text,null);
 assert.equal(prepareMagazineCommercialDraft({article:'道具選び。',product:{...product,affiliateUrl:'https://example.com'}}).status,'invalid_affiliate_url');
});
