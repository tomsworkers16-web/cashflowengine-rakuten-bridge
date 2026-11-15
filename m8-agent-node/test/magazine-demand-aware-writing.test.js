import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import {draftDemandAwareMagazine} from '../src/magazine-demand-aware-writing.js';
async function snapshot(){
 const day='2026-11-16';
 const captured=captureListingSearch(async keyword=>[{itemCode:'shop:100',itemName:keyword+' 水切りラック 収納 ラック シンク上',
  price:1980,reviewCount:200,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=1'}],{day});
 await discoverRevenueOpportunity(day,'19:30',{search:captured.search,includeSeasonal:true});
 return captured.snapshot();
}
const signal=(url)=>({topicId:'kitchen-cleanup',sourceType:'article',url,observedAt:'2026-11-16T01:00:00Z',title:'キッチンの水切りを考える',readerNeed:'水切りラック選びの疑問を調査する候補'});
test('source-aware brief remains explicitly unverified without model providers',async()=>{
 const s=await snapshot();
 const result=await draftDemandAwareMagazine(s,{demandSignals:[signal('https://example.org/a')]});
 if(result.status==='insufficient_topic_evidence'){assert.equal(result.publicationAllowed,false);return;}
 assert.equal(result.status,'writer_or_reviewer_not_configured');
 assert.equal(result.brief.sourcePolicy.verifiedReaderNeeds,false);
 assert.equal(result.publicationAllowed,false);
});
test('writer and reviewer cannot publish and non-accepted review fails closed',async()=>{
 const s=await snapshot();
 const result=await draftDemandAwareMagazine(s,{demandSignals:[signal('https://example.org/a')],
 writer:async()=> '水切りラックは置き場所の確認から。台所の寸法を測って選ぶと失敗を減らせそう。',
 reviewer:async()=>({decision:'revise',itemCode:'shop:100'})});
 assert.equal(result.publicationAllowed,false);
 assert.notEqual(result.status,'manual_review_required');
});
test('no invented demand evidence is accepted',async()=>{
 const s=await snapshot();
 const result=await draftDemandAwareMagazine(s,{demandSignals:[]});
 assert.equal(result.status,'insufficient_topic_evidence');
 assert.equal(result.publicationAllowed,false);
});
