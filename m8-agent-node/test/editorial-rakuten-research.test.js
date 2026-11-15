import test from 'node:test';
import assert from 'node:assert/strict';
import {runEditorialRakutenResearch} from '../src/editorial-rakuten-research.js';

test('read-only ranking to evidence packet without publishing or credential leaks',async()=>{
 const requests=[];
 const fetchFn=async(url,options)=>{
   requests.push({url:String(url),method:options.method||'GET'});
   const value=String(url);
   if(value.includes('/IchibaGenre/'))return {ok:true,json:async()=>({genre:{genreId:0},children:[]})};
   if(value.includes('/IchibaItem/Ranking/'))return {ok:true,json:async()=>({Items:[
     {Item:{itemCode:'shop:01',itemName:'水切りかご 収納',itemPrice:3200,rank:1,
       affiliateUrl:'https://example.com/a',genreId:1}},
     {Item:{itemCode:'shop2:02',itemName:'キッチン掃除 ブラシ',itemPrice:2500,rank:2,
       affiliateUrl:'https://example.com/b',genreId:2}}
   ]})};
   if(value.includes('/IchibaItem/Search/')){
      const code=new URL(value).searchParams.get('itemCode');
      return {ok:true,json:async()=>({Items:[{Item:{itemCode:code,itemName:'商品',itemPrice:3000,
        itemUrl:'https://example.com/p',affiliateUrl:'https://example.com/a'}}]})};
   }
   throw Error('unexpected_url');
 };
 const r=await runEditorialRakutenResearch({
   applicationId:'APP-SECRET',accessKey:'KEY-SECRET',affiliateId:'AFF-SECRET',fetchFn,
   max:2,delayFn:async()=>{}
 });
 assert.equal(r.mode,'read_only_no_publication');
 assert.equal(r.counts.researched,2);
 assert.equal(r.counts.published,0);
 assert.equal(r.counts.reviewCandidates,0);
 assert.equal(r.candidates.length,2);
 assert.equal(requests.length,4);
 assert.equal(JSON.stringify(r).includes('APP-SECRET'),false);
 assert.equal(JSON.stringify(r).includes('KEY-SECRET'),false);
});
test('max research count is limited to three',async()=>{
 await assert.rejects(()=>runEditorialRakutenResearch({max:4}),/invalid_editorial_research_max/);
});
