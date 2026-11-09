import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildProductSearchRequest,normalizeProductSearchResponse,summarizeReleaseDates,runProbe} from '../src/probe-rakuten-release-date.js';

test('request uses official API, keeps access key out of query string',()=>{
 const {url,headers}=buildProductSearchRequest({applicationId:'app-example',accessKey:'secret-example',keyword:'収納ラック',hits:5});
 assert.equal(url.hostname,'openapi.rakuten.co.jp');
 assert.equal(url.pathname,'/ichibaproduct/api/Product/Search/20250801');
 assert.equal(url.searchParams.get('formatVersion'),'2');
 assert.equal(headers.accessKey,'secret-example');
 assert.equal(url.toString().includes('secret-example'),false);
 assert.throws(()=>buildProductSearchRequest({applicationId:'a',accessKey:'b',keyword:'x',hits:100}),/hits_out_of_bounds/);
});
test('release date coverage counts missing dates, not invented ones',()=>{
 const rows=normalizeProductSearchResponse({products:[
  {productName:'収納用品',releaseDate:'2019-06-01',productId:'id1',reviewCount:25,salesItemCount:3},
  {productName:'台所用品',releaseDate:null,productCode:null},
  {productName:'小型家電',releaseDate:'',productId:'id3'}
 ]});
 const r=summarizeReleaseDates(rows,'収納');
 assert.equal(r.sampled,3);
 assert.equal(r.releaseDateFound,1);
 assert.equal(r.productIdFound,2);
 assert.equal(r.candidates[1].releaseYear,null);
 assert.throws(()=>normalizeProductSearchResponse({message:'permission denied'}),/unexpected_product_response_shape/);
});
test('bounded read-only three-keyword probe never posts or persists credentials',async()=>{
 let calls=0;
 const fetchFn=async(url,options)=>{
  calls++;
  assert.equal(options.headers.accessKey,'secret');
  assert.ok(url.toString().includes('applicationId=app'));
  return {ok:true,json:async()=>({products:[{productName:'道具',releaseDate:'2018-10-01'}]})};
 };
 const out=await runProbe({applicationId:'app',accessKey:'secret',keywords:['収納','掃除'],hits:2,fetchFn});
 assert.equal(calls,2);
 assert.equal(out.releaseDateCoveragePct,100);
 assert.equal(out.postingPerformed,false);
 assert.equal(out.persistencePerformed,false);
 assert.ok(!JSON.stringify(out).includes('secret'));
 await assert.rejects(runProbe({applicationId:'app',accessKey:'secret',keywords:['a','b','c','d'],fetchFn}),/keywords_out_of_bounds/);
 const source=fs.readFileSync(new URL('../src/probe-rakuten-release-date.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/writeFileSync|appendFileSync|method:\s*['"]POST['"]/);
});
