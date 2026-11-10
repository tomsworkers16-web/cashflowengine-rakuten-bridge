import test from 'node:test';
import assert from 'node:assert/strict';
import {researchMagazineIssue,createRakutenEditorialSearch} from '../src/magazine-research.js';
import {planMagazineIssue} from '../src/magazine-editorial.js';
test('research searches the issue keyword once before matching products',async()=>{
 const calls=[];
 const x=await researchMagazineIssue('2026-11-11','19:30',{search:async keyword=>{calls.push(keyword);return [];}});
 assert.deepEqual(calls,[planMagazineIssue('2026-11-11','19:30').researchKeyword]);
 assert.equal(x.productSelection,'no_relevant_candidate');
});
test('Rakuten adapter normalizes official response and does not retry 429',async()=>{
 const env={RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'key',RAKUTEN_AFFILIATE_ID:'affiliate'};
 let calls=0;
 const search=createRakutenEditorialSearch({env,fetchImpl:async url=>{
  calls++;assert.equal(new URL(url).searchParams.get('keyword'),'水切り ラック');
  return {ok:true,json:async()=>({Items:[{Item:{itemCode:'shop:1',itemName:'水切りラック',itemPrice:1980,affiliateUrl:'https://example.com/item'}}]})};
 }});
 assert.equal((await search('水切り ラック'))[0].price,1980);
 assert.equal(calls,1);
 const limited=createRakutenEditorialSearch({env,fetchImpl:async()=>{calls++;return {ok:false,status:429};}});
 await assert.rejects(limited('x'),/rakuten_search_http_429/);
 assert.equal(calls,2);
});

test('editorial search paces consecutive calls and refuses further calls after 429',async()=>{
 const env={RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'key',RAKUTEN_AFFILIATE_ID:'affiliate'};
 let calls=0;const delays=[];
 const search=createRakutenEditorialSearch({env,sleep:async ms=>{delays.push(ms);},fetchImpl:async()=>{
  calls++;return calls===1?{ok:true,json:async()=>({Items:[]})}:{ok:false,status:429,headers:{get:()=> '60'}};
 }});
 await search('first');
 await assert.rejects(search('second'),e=>e.message==='rakuten_search_http_429'&&e.searchNumber===2&&e.retryAfter==='60');
 await assert.rejects(search('third'),/rakuten_search_http_429/);
 assert.equal(calls,2);assert.deepEqual(delays,[2000]);
});
