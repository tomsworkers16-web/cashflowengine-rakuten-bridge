import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDemandSignals,demandEvidenceByTopic} from '../src/magazine-demand-evidence.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
const day='2026-11-11';
const evidence=(url,type,topicId='kitchen-cleanup')=>({url,sourceType:type,topicId,observedAt:'2026-11-10T12:00:00Z',title:'水切り道具の選び方と暮らしの課題',readerNeed:'キッチンの作業場所を確保したい'});
test('rejects duplicates, unsafe URLs and stale evidence without copying article bodies',()=>{
 const data=[evidence('https://example.org/guide','article'),evidence('https://example.org/guide','article'),evidence('http://example.net/page','social'),evidence('https://example.com/bad?token=secret','review'),{...evidence('https://example.net/old','article'),observedAt:'2025-01-01'}];
 const n=normalizeDemandSignals(data,{day});
 assert.equal(n.signals.length,1);assert.equal(n.rejections.length,4);
 assert.equal(n.signals[0].trafficVerified,false);
 assert.ok(!JSON.stringify(n).includes('token=secret'));
});
test('independent source types and domains produce capped support, not observed sales',()=>{
 const d=demandEvidenceByTopic([evidence('https://example.org/a','article'),evidence('https://example.net/b','social'),evidence('https://example.com/c','review')],{day});
 assert.equal(d.topics['kitchen-cleanup'].supportScore,10);
 assert.equal(d.meaning,'editorial_hypothesis_not_verified_demand');
});
test('fusion keeps prior baseline selection and scores unchanged',async()=>{
 const products=async keyword=>[{itemCode:'shop:1',itemName:keyword,price:1900,reviewCount:100,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://example.org/affiliate'}];
 const a=await discoverRevenueOpportunity(day,'19:30',{search:products,includeSeasonal:true});
 const b=await discoverRevenueOpportunity(day,'19:30',{search:products,includeSeasonal:true,demandSignals:[evidence('https://example.org/a','article'),evidence('https://example.net/b','social')]});
 assert.deepEqual(b.opportunities,a.opportunities);
 assert.equal(b.selected.topicId,a.selected.topicId);
 assert.equal(b.fusion.sourcesAccepted,2);
 assert.equal(b.fusion.opportunities.find(x=>x.topicId==='kitchen-cleanup').fusedScore,a.opportunities.find(x=>x.topicId==='kitchen-cleanup').score+5);
 assert.equal(b.publicationAllowed,false);
});
