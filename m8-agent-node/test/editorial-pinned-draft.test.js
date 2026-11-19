import test from 'node:test';
import assert from 'node:assert/strict';
import { runPinnedEditorialDraft, japanCheckedAt } from '../src/run-editorial-pinned-draft.js';

const html='<html><body><h1>収納 チェスト 壁付き</h1>'+
 '<p>材質 ポリプロピレン 仕様 ●組立品です ●組立時間：約20-30分</p>'+
 '<p>【スリムサイズ】 ●引出し内寸: 幅26 奥行き36 深さ16cm'+
 ' ●耐荷重: 天板(約)2kg、引出し1段あたり(約)2kg</p>'+
 '<p>【ワイドサイズ】 ●引出し内寸: 幅46 奥行き36 深さ16cm'+
 ' ●耐荷重: 天板(約)3kg、引出し1段あたり(約)3kg</p>'+
 '</body></html>';
const fakeFetch=async url=>{
 if(String(url).includes('openapi.rakuten.co.jp'))return {ok:true,json:async()=>({
  Items:[{Item:{itemCode:'e-kurashi:10048736',itemName:'壁付き チェスト 収納ケース',
   itemPrice:4999,itemUrl:'https://item.rakuten.co.jp/e-kurashi/s1u57/',
   affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/demo/'}}]
 })};
 if(String(url).startsWith('https://item.rakuten.co.jp/'))return {
  ok:true,headers:{get:k=>k==='content-type'?'text/html; charset=utf-8':null},
  arrayBuffer:async()=>Buffer.from(html,'utf8')
 };
 throw Error('unknown_endpoint');
};
test('official evidence and literal product specs create offline B-style article',async()=>{
 const out=await runPinnedEditorialDraft({
  applicationId:'APP_SECRET',accessKey:'ACCESS_SECRET',affiliateId:'AFF_SECRET',
  fetchFn:fakeFetch,checkedAt:'2026-11-20'
 });
 assert.equal(out.status,'review_candidate');
 assert.equal(out.evidenceCount,6);
 assert.match(out.article,/購入前に/);
 assert.match(out.article,/【PR】/);
 assert.match(out.article,/幅26×奥行36×深さ16cm/);
 assert.match(out.article,/幅46×奥行36×深さ16cm/);
 assert.equal(out.published,0);
 assert.equal(out.publishApproved,false);
 assert.doesNotMatch(JSON.stringify(out),/APP_SECRET|ACCESS_SECRET|AFF_SECRET/);
});
test('missing credentials holds article, never publishes',async()=>{
 const out=await runPinnedEditorialDraft({});
 assert.equal(out.status,'research_required');
 assert.equal(out.published,0);
});
test('incomplete page evidence cannot generate a draft',async()=>{
 const weakFetch=async url=>{
  const r=await fakeFetch(url);
  if(String(url).startsWith('https://item.rakuten.co.jp/'))return {
   ...r,arrayBuffer:async()=>Buffer.from('<html><body>商品名だけ</body></html>','utf8')
  };
  return r;
 };
 const out=await runPinnedEditorialDraft({
  applicationId:'app',accessKey:'key',affiliateId:'aff',
  fetchFn:weakFetch,checkedAt:'2026-11-20'
 });
 assert.equal(out.status,'research_required');
 assert.equal(out.published,0);
 assert.equal(out.article,undefined);
});


test('page verification date uses Japan local calendar day',()=>{
 assert.match(japanCheckedAt(),/^\d{4}-\d{2}-\d{2}$/);
 const expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 assert.equal(japanCheckedAt(),expected);
});
