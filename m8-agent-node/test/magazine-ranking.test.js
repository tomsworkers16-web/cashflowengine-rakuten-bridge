import test from 'node:test';
import assert from 'node:assert/strict';
import {createRakutenRankingSearch,attachRankingEvidence} from '../src/magazine-ranking.js';
test('ranking API normalizes scope and rank, keeps access key in header',async()=>{
 const search=createRakutenRankingSearch({env:{RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'key'},fetchImpl:async(url,opts)=>{
  assert.equal(new URL(url).searchParams.get('genreId'),'123');
  assert.equal(new URL(url).searchParams.has('accessKey'),false);
  assert.equal(opts.headers.accessKey,'key');
  return {ok:true,json:async()=>({lastBuildDate:'sample',Items:[{Item:{itemCode:'shop:1',rank:3}}]})};
 }});
 const snap=await search({genreId:123});
 const r=attachRankingEvidence({selected:{topicId:'a'},opportunities:[{topicId:'a',product:{itemCode:'shop:1'}},{topicId:'b',product:{itemCode:'shop:2'}}]},snap);
 assert.equal(r.selected.rankingEvidence.rank,3);
 assert.equal(r.opportunities[1].rankingEvidence.rank,null);
 assert.equal(r.rankingUsedForScore,false);
});
test('429 not retried',async()=>{
 let calls=0;
 const search=createRakutenRankingSearch({env:{RAKUTEN_APPLICATION_ID:'app',RAKUTEN_ACCESS_KEY:'key'},fetchImpl:async()=>{calls++;return {ok:false,status:429};}});
 await assert.rejects(search(),/ranking_http_429/);
 assert.equal(calls,1);
});
