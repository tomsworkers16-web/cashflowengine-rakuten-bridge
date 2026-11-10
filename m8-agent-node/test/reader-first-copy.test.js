import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRevenueCopy} from '../src/reader-first-copy.js';
import {revenueText,revenueCopyVariant,validatePublicationText} from '../src/product-posting.js';
const item={itemName:'洗面台 ヘアーキャッチャー 排水口 ゴミ受け',price:1980,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test?pc=original%3A123'};
test('default preserves legacy text and label',()=>{
 for(const day of ['2026-11-10','2026-11-11']){
  const r=buildRevenueCopy(item,day);
  assert.equal(r.text,revenueText(item,revenueCopyVariant(day)));
  assert.equal(r.copyVariant,revenueCopyVariant(day));
  assert.equal(r.experiment,'legacy');
 }
});
test('opt-in uses problem question on odd days, preserves even-day control',()=>{
 const r=buildRevenueCopy(item,'2026-11-11',{enabled:true});
 assert.equal(r.copyVariant,'reader_problem_question_v1');
 assert.match(r.text,/洗面台の排水口、髪の毛の掃除が気になりませんか？/);
 assert.equal(validatePublicationText(r.text,{affiliateUrl:item.affiliateUrl,revenue:true}),null);
 assert.ok(r.text.includes('1,980'));
 const control=buildRevenueCopy(item,'2026-11-12',{enabled:true});
 assert.equal(control.text,revenueText(item,'compare_before_buy'));
 assert.equal(control.copyVariant,'compare_before_buy');
});
test('unknown category or length constraint falls back with truthful label',()=>{
 for(const candidate of [{...item,itemName:'陶器の花瓶'},{...item,affiliateUrl:'https://example.com/'+ 'x'.repeat(430)}]){
  const r=buildRevenueCopy(candidate,'2026-11-11',{enabled:true});
  assert.equal(r.copyVariant,'spec_check');
  assert.equal(r.text,revenueText(candidate,'spec_check'));
 }
});
test('invalid link does not produce experimental text',()=>{
 assert.equal(buildRevenueCopy({...item,affiliateUrl:'http://example.com'},'2026-11-11',{enabled:true}).text,null);
});
