import test from 'node:test';
import assert from 'node:assert/strict';
import {planMagazineIssue} from '../src/magazine-editorial.js';
import {matchEditorialProducts,previewMagazineWithProducts} from '../src/magazine-product-preview.js';
const items=[
 {itemCode:'shop:1',itemName:'洗面台 排水口 ヘアーキャッチャー',price:1980,affiliateUrl:'https://example.com/item?ref=original'},
 {itemCode:'shop:2',itemName:'収納 ラック',price:3000,affiliateUrl:'https://example.com/item2'},
 {itemCode:'shop:3',itemName:'水切りラック',price:4000,affiliateUrl:'https://example.com/item3'},
 {itemCode:'shop:4',itemName:'洗面台 タオル',price:1000,affiliateUrl:'https://example.com/item4'}
];
test('article-led title matching excludes unrelated items and does not claim verified specs',()=>{
 for(const day of ['2026-11-11','2026-11-12','2026-11-13']){
  const issue=planMagazineIssue(day,'19:30');
  const found=matchEditorialProducts(issue,items);
  assert.equal(found.length,1);
  assert.equal(found[0].specificationsVerified,false);
  assert.notEqual(found[0].itemCode,'shop:4');
  const preview=previewMagazineWithProducts(day,'19:30',items);
  assert.equal(preview.productSelection,'title_matched_review_required');
  assert.equal(preview.status,'preview_only');
  assert.ok(preview.commercialDraft.startsWith('【PR】'));
  assert.ok(preview.commercialDraft.endsWith(found[0].affiliateUrl));
  assert.ok(preview.commercialDraft.length<=500);
 }
});
test('no relevant product leaves the article intact, without affiliate draft',()=>{
 const x=previewMagazineWithProducts('2026-11-11','19:30',[]);
 assert.equal(x.productSelection,'no_relevant_candidate');
 assert.equal(x.commercialDraft,null);
 assert.equal(x.text,planMagazineIssue('2026-11-11','19:30').text);
});
test('long tracking link never truncated; invalid commercial draft omitted',()=>{
 const day='2026-11-11';
 const candidates=items.map(x=>({...x,affiliateUrl:'https://example.com/'+ 'x'.repeat(470)}));
 const x=previewMagazineWithProducts(day,'19:30',candidates);
 assert.equal(x.commercialDraft,null);
 assert.equal(x.commercialDraftStatus,'too_long_or_invalid');
});
