import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDailyThreadsCycle} from '../src/threads-daily-preparation.js';
const day='2026-11-24',page='https://item.rakuten.co.jp/shop/chest/';
const item={itemCode:'shop:1',itemName:'収納チェスト ラック',price:4999,rank:2,hasAffiliateUrl:true};
const input={jstDate:day,applicationId:'synthetic',accessKey:'synthetic',affiliateId:'synthetic',delayFn:async()=>{},discover:async()=>({editorialShortlist:{selected:[item]}}),fetchEvidence:async()=>({itemCode:item.itemCode,status:'needs_product_detail_research',productPageUrl:page,affiliateUrl:'https://hb.afl.rakuten.co.jp/ichiba/example/?pc='+encodeURIComponent(page)}),fetchPage:async()=>({url:page,html:'<html>商品説明 材質 ポリプロピレン 組立時間：約20-30分 収納チェスト 【スリムサイズ】 引出し内寸: 幅26 奥行き36 深さ16cm 耐荷重: 天板(約)2kg、引出し1段あたり(約)2kg 【ワイドサイズ】 引出し内寸: 幅46 奥行き36 深さ16cm 耐荷重: 天板(約)3kg、引出し1段あたり(約)3kg</html>'})};
test('mocked official discovery and page evidence prepare one three-stage plan',async()=>{
 const p=await prepareDailyThreadsCycle(input);assert.equal(p.status,'batch_review_required');assert.equal(p.slots.length,3);assert.equal(p.researchAttemptCount,1);assert.equal(p.published,0);
 assert.match(p.slots[1].text,/幅26/);assert.match(p.slots[1].text,/幅46/);assert.match(p.slots[1].text,/耐荷重/);
});
test('discovery 429 stops without detail request',async()=>{
 let called=0;const p=await prepareDailyThreadsCycle({...input,discover:async()=>{throw Error('rakuten_ranking_http_429')},fetchEvidence:async()=>{called++;}});assert.equal(p.reason,'rakuten_rate_limited');assert.equal(called,0);
});
test('item 429 stops without later candidate or page fetch',async()=>{
 let called=0,pageCalls=0;const p=await prepareDailyThreadsCycle({...input,discover:async()=>({editorialShortlist:{selected:[item,{...item,itemCode:'other:1'}]}}),fetchEvidence:async()=>{called++;throw Error('rakuten_item_http_429')},fetchPage:async()=>{pageCalls++;}});assert.equal(p.reason,'rakuten_rate_limited');assert.equal(called,1);assert.equal(pageCalls,0);
});
test('insufficient real-page evidence holds the PR sequence',async()=>{const p=await prepareDailyThreadsCycle({...input,fetchPage:async()=>({url:page,html:'<html>仕様不明</html>'})});assert.equal(p.status,'research_required');assert.equal(p.slots.length,0);});
