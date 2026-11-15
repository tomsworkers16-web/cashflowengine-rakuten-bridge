import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import {previewFeedFusion} from '../src/preview-magazine-feed-fusion.js';
async function makeSnapshot(day='2026-11-15'){
 const capture=captureListingSearch(async keyword=>[{itemCode:'shop:100',itemName:keyword+' 水切りラック 収納 ラック シンク上',price:1980,reviewCount:200,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=1'}],{day});
 await discoverRevenueOpportunity(day,'19:30',{search:capture.search,includeSeasonal:true});
 return capture.snapshot();
}
test('fresh approved feeds connect to unmodified baseline Rakuten scores without publishing',async()=>{
 const snapshot=await makeSnapshot();
 let calls=0;
 const urls=['https://example.org/feed.json','https://example.net/feed.json'];
 const feeds=urls.map(url=>({enabled:true,url,allowedDomain:new URL(url).hostname}));
 const fetchImpl=async url=>{
  calls++;
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({
   version:'https://jsonfeed.org/version/1.1',
   items:[{title:'シンク上の水切りラックが気になる',url:new URL('/story',url).href}]
  })};
 };
 const data=await previewFeedFusion(snapshot,{feeds,fetchImpl,now:()=> '2026-11-15T08:00:00Z'});
 assert.equal(data.status,'read_only_fusion_comparison');
 assert.equal(calls,2);
 assert.equal(data.evidence.signalsAccepted,2);
 assert.equal(data.publicationAllowed,false);
 assert.equal(data.isDemandVerified,false);
 assert.equal(data.comparisonShowsMeasuredRevenue,false);
});
test('stale snapshot refuses to fetch present-day article evidence, not backdating it',async()=>{
 let calls=0;
 const data=await previewFeedFusion(await makeSnapshot('2026-11-11'),{
 feeds:[{enabled:true,url:'https://example.org/feed.json',allowedDomain:'example.org'}],
 fetchImpl:async()=>{calls++;throw Error('must not reach network');},
 now:()=> '2026-11-15T08:00:00Z'});
 assert.equal(data.status,'snapshot_stale_for_live_evidence');
 assert.equal(calls,0);
 assert.equal(data.publicationAllowed,false);
});
