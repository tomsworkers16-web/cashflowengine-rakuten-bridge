import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProductName, editorialText, revenueText, roleForSlot } from '../src/product-posting.js';

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
