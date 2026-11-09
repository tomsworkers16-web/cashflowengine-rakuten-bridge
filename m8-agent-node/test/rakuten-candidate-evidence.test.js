import test from 'node:test';
import assert from 'node:assert/strict';
import {makeItemDetailRequest,parseVerifiedItem,addEvidenceScore,enrichShortlist} from '../src/rakuten-candidate-evidence.js';
import {runDiscoveryProbe} from '../src/probe-rakuten-discovery.js';

const candidate={itemCode:'demo:123',itemName:'真空保存容器',rank:4,priority:50,theme:'food_preservation',shop:'demo'};
const response={Items:[{Item:{itemCode:'demo:123',itemPrice:3480,affiliateRate:4,reviewCount:160,reviewAverage:4.6,affiliateUrl:'https://example.invalid/affiliate'}}]};

test('official item-code lookup never exposes the access key as a URL parameter',()=>{
 const req=makeItemDetailRequest('demo:123',{applicationId:'app',accessKey:'secret',affiliateId:'aff'});
 assert.equal(req.url.searchParams.get('itemCode'),'demo:123');
 assert.equal(req.headers.accessKey,'secret');
 assert.equal(req.url.href.includes('secret'),false);
 assert.equal(req.url.searchParams.get('affiliateId'),'aff');
 assert.throws(()=>makeItemDetailRequest('bad/item',{applicationId:'a',accessKey:'b',affiliateId:'c'}),/invalid_item_code/);
});
test('exact item matching and gross-only commission calculation',()=>{
 const item=parseVerifiedItem(response,'demo:123');
 assert.equal(item.price,3480);
 assert.equal(item.affiliateRatePct,4);
 assert.equal(item.indicativeGrossYen,139);
 assert.equal(item.verifiedConversionRate,null);
 assert.equal(parseVerifiedItem(response,'demo:999'),null);
 const cap=parseVerifiedItem({Items:[{Item:{itemCode:'demo:123',itemPrice:50000,affiliateRate:4,affiliateUrl:'https://x.invalid'}}]},'demo:123');
 assert.equal(cap.indicativeGrossYen,1000);
 assert.throws(()=>parseVerifiedItem({error:'x'},'demo:123'),/unexpected_item_search_shape/);
});
test('candidate quality score is evidence limited and has no fake profit forecast',()=>{
 const enriched=addEvidenceScore(candidate,parseVerifiedItem(response,'demo:123'));
 assert.equal(enriched.researchStatus,'candidate_for_editorial_review');
 assert.ok(enriched.evidenceScore>candidate.priority);
 assert.equal(enriched.detail.claimedSalesVolume,null);
 assert.equal(enriched.detail.verifiedLongevity,null);
 assert.equal(addEvidenceScore(candidate,null).researchStatus,'item_not_found');
});
test('enrichment is bounded and does not publish or persist',async()=>{
 let count=0;
 const fetchFn=async()=>{count++;return{ok:true,json:async()=>response};};
 const result=await enrichShortlist([candidate],{applicationId:'app',accessKey:'secret',affiliateId:'aff',fetchFn,delayMs:0});
 assert.equal(count,1);
 assert.equal(result.postingPerformed,false);
 assert.equal(result.persistencePerformed,false);
 assert.equal(result.products[0].detail.reviewCount,160);
 assert.ok(!JSON.stringify(result).includes('secret'));
 await assert.rejects(enrichShortlist(Array(6).fill(candidate),{applicationId:'app',accessKey:'secret',affiliateId:'aff',fetchFn}),/too_many_candidates/);
});
test('discovery probe enriches only with explicit opt-in flag',async()=>{
 let requests=0;
 const fetchFn=async url=>{
  requests++;
  if(url.pathname.includes('Genre'))return{ok:true,json:async()=>({genre:{genreId:558944,nameJa:'キッチン'},children:[]})};
  if(url.pathname.includes('Ranking'))return{ok:true,json:async()=>({Items:[{Item:{rank:1,itemCode:'demo:123',itemName:'真空保存容器',itemPrice:3480,affiliateUrl:'https://example.invalid'}}]})};
  return{ok:true,json:async()=>response};
 };
 const base={applicationId:'app',accessKey:'secret',affiliateId:'aff',fetchFn,genreId:558944};
 const plain=await runDiscoveryProbe(base);
 assert.equal(requests,2);
 assert.equal(plain.itemEvidence,undefined);
 const extended=await runDiscoveryProbe({...base,enrich:true});
 assert.equal(requests,5);
 assert.equal(extended.itemEvidence.count,1);
 assert.equal(extended.itemEvidence.products[0].detail.indicativeGrossYen,139);
});
