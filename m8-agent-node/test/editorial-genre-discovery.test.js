import test from 'node:test';
import assert from 'node:assert/strict';
import {runEditorialGenreDiscovery} from '../src/run-editorial-genre-discovery.js';

test('category-first discovery returns non-storage buyer-helpful goods only and does not publish',async()=>{
 const ids=[];
 const fetchFn=async(u)=>{
  const url=new URL(String(u)),id=url.searchParams.get('genreId');
  ids.push({id,path:url.pathname});
  if(url.pathname.includes('/IchibaGenre/'))return {ok:true,json:async()=>({
    genre:{genreId:Number(id),nameJa:'対象カテゴリ'},children:[]
  })};
  const products=id==='558944'?[
    {rank:1,itemCode:'dish:001',itemName:'真空保存容器 密閉容器',itemPrice:3390},
    {rank:2,itemCode:'choco:002',itemName:'チョコレート 食品',itemPrice:3000}
  ]:[
    {rank:1,itemCode:'clean:003',itemName:'掃除ブラシ',itemPrice:1880},
    {rank:2,itemCode:'wear:004',itemName:'カップなしインナー',itemPrice:3200}
  ];
  return {ok:true,json:async()=>({Items:products.map(p=>({Item:{...p,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/demo/'}}))})};
 };
 const out=await runEditorialGenreDiscovery({applicationId:'APP_SECRET',accessKey:'KEY_SECRET',
  affiliateId:'AFF_SECRET',fetchFn,delayFn:async()=>{}});
 assert.equal(out.status,'candidates_found');
 assert.equal(out.results.length,2);
 assert.equal(out.totalCandidates,2);
 assert.deepEqual(out.results.flatMap(x=>x.candidates.map(c=>c.theme)),['food_preservation','cleaning']);
 assert.equal(ids.length,4);
 assert.equal(out.published,0);
 assert.equal(out.postingPerformed,false);
 assert.doesNotMatch(JSON.stringify(out),/APP_SECRET|KEY_SECRET|AFF_SECRET/);
});
test('empty category discovery is honestly reported as no eligible candidates',async()=>{
 const fetchFn=async(u)=>({ok:true,json:async()=>String(u).includes('/IchibaGenre/')
  ?{genre:{genreId:0},children:[]}
  :{Items:[{Item:{rank:1,itemCode:'food:003',itemName:'チョコレート',
     itemPrice:2000,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/demo/'}}]}});
 const out=await runEditorialGenreDiscovery({applicationId:'a',accessKey:'b',
   fetchFn,delayFn:async()=>{}});
 assert.equal(out.status,'no_eligible_candidates');
 assert.equal(out.totalCandidates,0);
 assert.equal(out.published,0);
});
