import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProductName, editorialText, revenueText, roleForSlot, validatePublicationText } from '../src/product-posting.js';

test('affiliate posts include a clear disclosure and the full original link', () => {
  const url = 'https://affiliate.example.jp/product?item=shop%3A10002149&affiliateId=abc';
  const text = revenueText({itemName:'テスト収納ラック',price:3960,affiliateUrl:url});
  assert.ok(text.startsWith('【PR・アフィリエイト】'));
  assert.ok(text.endsWith(url));
  assert.ok(text.length <= 500);
  assert.match(text, /価格|3,960/);
});

test('missing or implausibly long affiliate URLs never become revenue posts', () => {
  assert.equal(revenueText({itemName:'商品',affiliateUrl:''}), null);
  assert.equal(revenueText({itemName:'商品',affiliateUrl:'http://example.com'}), null);
  assert.equal(revenueText({itemName:'商品',affiliateUrl:'https://example.com/'+'x'.repeat(460)}), null);
});

test('editorial copy does not invent first-hand ownership or link to affiliate commerce', () => {
  const body = editorialText({itemName:'【送料無料】 包丁スタンド\n',price:1800,reviewCount:40});
  assert.ok(body);
  assert.ok(!body.includes('【送料無料】'));
  assert.ok(!body.includes('使ってみました'));
  assert.ok(!body.includes('https://'));
  assert.equal(cleanProductName('【セール】商品\n名'), '商品 名');
});

test('slot assignment reserves a revenue slot on multi-post days', () => {
  assert.equal(roleForSlot('07:30',['07:30','12:30','19:30'],5),'discovery');
  assert.equal(roleForSlot('12:30',['07:30','12:30','19:30'],5),'revenue');
});

test('long real Rakuten listing does not split product name mid-keyword', () => {
  const name='【オトクなクーポン配布中】 スターフィルター 換気扇フィルター レンジフードフィルター レンジフィルターカバー スターターセット 強力マグネット+交換フィルター3枚';
  const clean=cleanProductName(name);
  assert.ok(clean.length <= 44);
  assert.equal(clean.includes('フィルタ」'),false);
  assert.ok(clean.includes('スターフィルター'));
  const url='https://hb.afl.rakuten.co.jp/hgc/test/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fdemo%2F123%2F';
  const body=revenueText({itemName:name,price:3080,affiliateUrl:url});
  assert.ok(body?.endsWith(url));
  assert.equal(validatePublicationText(body,{affiliateUrl:url,revenue:true}),null);
});

test('a long but valid link is never truncated or silently stripped', () => {
  const url='https://hb.afl.rakuten.co.jp/hgc/test/?pc='+ 'x'.repeat(375);
  const body=revenueText({itemName:'収納用フック',price:1600,affiliateUrl:url});
  assert.ok(body && body.length<=500);
  assert.ok(body.endsWith(url));
  assert.equal(validatePublicationText(body,{affiliateUrl:url,revenue:true}),null);
});

test('guard rejects corrupted Japanese and missing PR disclosure without a network call', () => {
  assert.match(validatePublicationText('縺ｮ蛻ｩ繧ｰ繝・ぜ'),/mojibake/);
  assert.equal(validatePublicationText('商品はおすすめです\nhttps://affiliate.invalid',{
    revenue:true,affiliateUrl:'https://affiliate.invalid'
  }),'pr_disclosure_missing');
  assert.equal(validatePublicationText('【PR・アフィリエイト】\nhttps://a.invalid',{
    revenue:true,affiliateUrl:'https://b.invalid'
  }),'affiliate_url_missing_or_modified');
});
