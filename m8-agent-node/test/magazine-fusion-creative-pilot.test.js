import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import {buildMatchedFusionCreativePacket} from '../src/magazine-fusion-creative-pilot.js';
const day='2026-11-11';
const signal=(url)=>({topicId:'kitchen-cleanup',sourceType:'article',url,observedAt:'2026-11-11T10:00:00Z',title:'水切りの置き場所と考え方',readerNeed:'キッチンの調理場所を確保する方法を知りたい'});
async function snapshot(kind='same'){
 const capture=captureListingSearch(async keyword=>[
 {itemCode:'rack-town:10000550',itemName:keyword+' 水切りラック シンク上 2段',price:10800,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=x',reviewCount:3304,reviewAverage:4.37,affiliateRate:3},
 ...(kind==='different'?[{itemCode:'shop:2',itemName:keyword+' ラック',price:1980,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=y',reviewCount:5000,reviewAverage:4.8,affiliateRate:3}]:[])
 ],{day});
 await discoverRevenueOpportunity(day,'19:30',{search:capture.search,includeSeasonal:true});
 return capture.snapshot();
}
test('same-item creative packet keeps PR/unchanged URL and prohibits publishing',async()=>{
 const packet=await buildMatchedFusionCreativePacket(await snapshot(),[signal('https://example.org/a'),signal('https://example.net/b')]);
 assert.equal(packet.status,'creatives_ready_for_review');
 assert.equal(packet.arms.length,2);
 assert.deepEqual(packet.arms.map(x=>x.arm),['baseline','fusion']);
 assert.equal(packet.productItemCode,'rack-town:10000550');
 assert.equal(packet.fusedScore,packet.baselineScore+3);
 for(const x of packet.arms){
  assert.equal(x.itemCode,packet.productItemCode);
  assert.equal(x.draft.publicationAllowed,false);
  assert.ok(x.draft.text.startsWith('【PR】'));
  assert.ok(x.draft.text.endsWith('https://hb.afl.rakuten.co.jp/hgc/test/?pc=x'));
  assert.ok(x.draft.characters<=500);
 }
 assert.notEqual(packet.arms[0].draft.text,packet.arms[1].draft.text);
 assert.equal(packet.publicationAllowed,false);
 assert.equal(packet.assignmentStatus,'not_assigned');
});
test('fails closed without independent evidence',async()=>{
 const packet=await buildMatchedFusionCreativePacket(await snapshot(),[signal('https://example.org/a')]);
 assert.equal(packet.status,'insufficient_external_evidence');
 assert.deepEqual(packet.arms,[]);
});
test('does not equate changed item selection with a copy-only A/B experiment',async()=>{
 const p=await buildMatchedFusionCreativePacket(await snapshot('different'),[signal('https://example.org/a'),signal('https://example.net/b')]);
 assert.equal(p.publicationAllowed,false);
 if(p.status==='creatives_ready_for_review')assert.ok(p.arms.every(x=>x.itemCode===p.productItemCode));
 else assert.deepEqual(p.arms,[]);
});
