import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import evidence from '../fixtures/magazine-demand-evidence-20261111.json' with {type:'json'};
// Reconstructed top-per-lane input from the user's 2026-11-11 M8 output.
// This is a regression fixture, NOT the complete live 99-result Rakuten snapshot.
const listings={
 'kitchen-cleanup':{itemCode:'rack-town:10000550',itemName:'燕三条 正規品 水切りラック シンク上 2段 ステンレス 突っ張り 水切り おしゃれ',price:10800,reviewCount:3304,reviewAverage:4.37,affiliateRate:3},
 'storage-flow':{itemCode:'nissen-rhg:10000056',itemName:'日本製 ランドセルラック 収納 ラック',price:23900,reviewCount:451,reviewAverage:4.38,affiliateRate:3},
 'washbasin':{itemCode:'sinkatec:10000425',itemName:'HUBATH 洗面台 ヘアーキャッチャー 排水口 ゴミ受け',price:1980,reviewCount:12378,reviewAverage:4.68,affiliateRate:3},
 'winter-warmth':{itemCode:'hitidear:10000173',itemName:'電気毛布 ひざ掛け',price:12900,reviewCount:3795,reviewAverage:4.56,affiliateRate:2},
 'winter-cleaning':{itemCode:'osouji-kis:10000099',itemName:'窓 掃除 スクイージー',price:9999,reviewCount:141,reviewAverage:4.62,affiliateRate:3}
};
test('real-log top products: fusion adds corroboration without rewriting baseline or promising lift',async()=>{
 const search=async keyword=>Object.values(listings).filter(x=>keyword.split(/\s+/u).some(k=>x.itemName.includes(k))).map(x=>({...x,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=a'}));
 // Query/title match may include multiple candidates; only compare the original and fused plans.
 const base=await discoverRevenueOpportunity('2026-11-11','19:30',{search,includeSeasonal:true});
 const fused=await discoverRevenueOpportunity('2026-11-11','19:30',{search,includeSeasonal:true,demandSignals:evidence});
 assert.deepEqual(fused.opportunities,base.opportunities);
 assert.equal(fused.fusion.sourcesAccepted,2);
 assert.equal(fused.fusion.sourcesRejected,0);
 const kitchen=fused.fusion.opportunities.find(x=>x.topicId==='kitchen-cleanup');
 assert.equal(kitchen.demandEvidence.sourceDomains,2);
 assert.equal(kitchen.demandEvidence.supportScore,3);
 assert.equal(kitchen.fusedScore,kitchen.score+3);
 assert.equal(fused.publicationAllowed,false);
});
