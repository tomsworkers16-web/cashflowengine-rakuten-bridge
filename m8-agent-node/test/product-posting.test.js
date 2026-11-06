import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProductName, editorialText, productUseCase, revenueText, revenueCopyVariant, roleForSlot, validatePublicationText } from '../src/product-posting.js';

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

test('affiliate copy experiments preserve disclosure, price and exact URL',()=>{
 const url='https://hb.afl.rakuten.co.jp/hgc/test?pc=sku-1';
 const item={itemName:'収納ラック',price:2480,affiliateUrl:url};
 assert.equal(revenueCopyVariant('2026-11-05'),'spec_check');
 assert.equal(revenueCopyVariant('2026-11-06'),'compare_before_buy');
 for(const variant of ['spec_check','compare_before_buy']){
  const body=revenueText(item,variant);
  assert.equal(validatePublicationText(body,{revenue:true,affiliateUrl:url}),null);
  assert.ok(body.startsWith('【PR・アフィリエイト】'));
  assert.ok(body.endsWith(url));
  assert.ok(body.includes('2,480'));
  assert.ok(!body.includes('使ってみた'));
 }
 assert.notEqual(revenueText(item,'spec_check'),revenueText(item,'compare_before_buy'));
});

test('publicly observed Rakuten promotional title keeps the actual product name',()=>{
 const listing='11/11 1:59までエントリーでP5倍！ 《楽天１位》【待望のスモールサイズ新登場！】《楽天１位》【 HUBATH 洗面台 ヘアーキャッチャー 】 排水口 ゴミ受け 排水溝 掃除 排水溝ネット';
 const name=cleanProductName(listing);
 assert.ok(name.startsWith('HUBATH 洗面台 ヘアーキャッチャー'),name);
 assert.ok(!name.includes('エントリー'));
 assert.ok(!name.includes('楽天１位'));
 const url='https://hb.afl.rakuten.co.jp/hgc/example/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fsinkatec%2Fhu_shair_catcher%2F';
 const body=revenueText({itemName:listing,price:1980,affiliateUrl:url},'compare_before_buy');
 assert.ok(body.includes('HUBATH 洗面台 ヘアーキャッチャー'));
 assert.equal(validatePublicationText(body,{affiliateUrl:url,revenue:true}),null);
});

test('bracketed substantive product titles are preserved, marketing tags removed',()=>{
 assert.equal(cleanProductName('【送料無料】 包丁スタンド'),'包丁スタンド');
 assert.equal(cleanProductName('【セール】商品\n名'),'商品 名');
 assert.equal(cleanProductName('【HUBATH 洗面台 ヘアーキャッチャー】'),'HUBATH 洗面台 ヘアーキャッチャー');
});

test('use-case lead highlights actual product need without claims or fake experience',()=>{
 const item={
  itemName:'【HUBATH 洗面台 ヘアーキャッチャー】 排水口 ゴミ受け',
  price:1980,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/example/?pc=product'
 };
 const hook=productUseCase(item);
 assert.match(hook,/洗面台の排水口/);
 const post=revenueText(item,'compare_before_buy');
 assert.match(post,/髪の毛の掃除/);
 assert.ok(post.endsWith(item.affiliateUrl));
 assert.equal(validatePublicationText(post,{revenue:true,affiliateUrl:item.affiliateUrl}),null);
 const editorial=editorialText(item);
 assert.match(editorial,/洗面台の排水口/);
 assert.doesNotMatch(post,/使ってみた|絶対|必ず|効果がある/);
});
test('unknown product and unrelated generic items receive no invented hook',()=>{
 assert.equal(productUseCase({itemName:'陶器の花瓶'}),null);
 assert.equal(productUseCase({itemName:'洗面台用タオル'}),null);
 assert.ok(revenueText({itemName:'陶器の花瓶',price:1200,affiliateUrl:'https://example.com/item'}));
});
test('long affiliate URLs prefer link safety over context paragraphs',()=>{
 const url='https://hb.afl.rakuten.co.jp/hgc/example/?pc='+'x'.repeat(375);
 const post=revenueText({itemName:'収納ラック',price:2480,affiliateUrl:url});
 assert.ok(post&&post.length<=500);
 assert.ok(post.endsWith(url));
 assert.equal(validatePublicationText(post,{affiliateUrl:url,revenue:true}),null);
});
