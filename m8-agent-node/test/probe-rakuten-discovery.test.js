import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRequest,rankingSummary,genreSummary,runDiscoveryProbe} from '../src/probe-rakuten-discovery.js';

test('ranking and genre endpoints include no secrets in URL',()=>{
 const opts={applicationId:'app123',accessKey:'private123',affiliateId:'affiliate',genreId:0};
 const r=makeRequest('ranking',opts);
 const g=makeRequest('genre',opts);
 assert.match(r.url.pathname,/Ranking\/20220601/);
 assert.match(g.url.pathname,/Search\/20260701/);
 assert.equal(r.url.searchParams.has('genreId'),false);
 assert.equal(g.url.searchParams.get('genreId'),'0');
 assert.equal(r.headers.accessKey,'private123');
 assert.doesNotMatch(r.url.href,/private123/);
 assert.throws(()=>makeRequest('ranking',{...opts,period:'bad'}),/invalid_period/);
 assert.throws(()=>makeRequest('genre',{...opts,genreId:-1}),/invalid_genre_id/);
});

test('ranking is formatted as candidates, without treating rank as sold quantity',()=>{
 const data=rankingSummary({lastBuildDate:'2026-11-09',Items:[
 {Item:{rank:1,itemName:'家事便利',itemCode:'demo:1',itemPrice:2900,affiliateUrl:'https://example.invalid/abc'}},
 {Item:{rank:2,itemName:'スマホ便利',itemCode:'demo:2',itemPrice:3990}}
 ]});
 assert.equal(data.sampled,2);
 assert.equal(data.items[0].rank,1);
 assert.equal(data.items[1].hasAffiliateUrl,false);
 assert.equal(Object.hasOwn(data.items[0],'salesCount'),false);
 assert.throws(()=>rankingSummary({error:'bad'}),/unexpected_ranking_shape/);
});

test('genre taxonomy is read-only and limited',()=>{
 const data=genreSummary({genre:{genreId:0,nameJa:'ルート'},
 children:[{genreId:1,nameJa:'家電',level:1},{genreId:2,nameJa:'キッチン',level:1}]});
 assert.equal(data.children.length,2);
 assert.equal(data.genreName,'ルート');
 assert.throws(()=>genreSummary({}),/unexpected_genre_shape/);
});

test('probe performs only two sequential GET requests',async()=>{
 const calls=[];
 const fetchFn=async(u,options)=>{
  calls.push({pathname:u.pathname,options});
  return {ok:true,json:async()=>u.pathname.includes('Genre')?
  {genre:{genreId:0,nameJa:'ルート'},children:[{genreId:1,nameJa:'日用品'}]}:
  {lastBuildDate:'2026-11-10',Items:[{Item:{rank:1,itemName:'道具',itemCode:'demo:1'}}]}};
 };
 const result=await runDiscoveryProbe({applicationId:'app',accessKey:'secret',fetchFn});
 assert.equal(calls.length,2);
 assert.equal(result.results.ranking.sampled,1);
 assert.equal(result.results.genre.children.length,1);
 assert.equal(result.postingPerformed,false);
 assert.equal(result.persistencePerformed,false);
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(calls.every(c=>c.options.redirect==='error'),true);
});

test('live M8 anomaly: descending 30..1 is sorted BEFORE selecting the top ten',()=>{
 const input=Array.from({length:30},(_,i)=>({
   Item:{rank:30-i,itemCode:'test:'+(30-i),itemName:'検証用商品'}
 }));
 const result=rankingSummary({Items:input},10);
 assert.equal(result.received,30);
 assert.equal(result.sampled,10);
 assert.deepEqual(result.items.map(x=>x.rank),[1,2,3,4,5,6,7,8,9,10]);
});
test('invalid zero, missing or unparseable ranks are not recommended as top results',()=>{
 const result=rankingSummary({Items:[
  {Item:{rank:0,itemCode:'invalid:1'}},
  {Item:{rank:'unknown',itemCode:'invalid:2'}},
  {Item:{rank:2,itemCode:'valid:2'}},
  {Item:{rank:1,itemCode:'valid:1'}}
 ]});
 assert.deepEqual(result.items.map(x=>x.rank),[1,2]);
 assert.equal(result.validRankCount,2);
});
test('genre-specific probe applies the selected genre to taxonomy and ranking',()=>{
 const opts={applicationId:'app',accessKey:'secret',genreId:'562637'};
 const ranking=makeRequest('ranking',opts);
 const genre=makeRequest('genre',opts);
 assert.equal(ranking.url.searchParams.get('genreId'),'562637');
 assert.equal(genre.url.searchParams.get('genreId'),'562637');
});
