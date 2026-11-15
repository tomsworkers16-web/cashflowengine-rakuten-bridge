import test from 'node:test';
import assert from 'node:assert/strict';
import { rakutenEditorialEvidence, fetchRakutenEditorialEvidence, assembleEditorialResearch }
  from '../src/editorial-rakuten-evidence.js';
import { buildEditorialArticleWorkflow } from '../src/editorial-article-workflow.js';

const candidate={itemCode:'shop:001',itemName:'水切りかご 収納',price:3300,rank:2,hasAffiliateUrl:true};
const apiItem={itemCode:'shop:001',itemName:'水切りかご 収納',itemPrice:3300,reviewCount:14,
  itemUrl:'https://example.com/product',affiliateUrl:'https://example.com/affiliate'};
const payload={Items:[{Item:apiItem}]};
const review=()=>({itemCode:'shop:001',reviewed:true,sourceUrl:'https://example.com/product',
  checkedAt:'2026-11-16',specs:[
    {id:'size',claim:'販売ページの寸法記載を確認',quote:'幅30cm',sourceUrl:'https://example.com/product',reviewed:true},
    {id:'material',claim:'販売ページの材質記載を確認',quote:'ステンレス',sourceUrl:'https://example.com/product',reviewed:true}
  ]});

test('API listing provides observable fields but is not full product research',()=>{
 const e=rakutenEditorialEvidence(payload,'shop:001',{checkedAt:'2026-11-16'});
 assert.equal(e.status,'needs_product_detail_research');
 assert.equal(e.research,null);
 assert.ok(e.missing.includes('product_specific_specs_confirmed_against_product_page'));
 assert.ok(e.facts.some(f=>f.id==='rakuten_item_price'));
});
test('no credentials appear in output of official read-only request',async()=>{
 const r=await fetchRakutenEditorialEvidence('shop:001',{
  applicationId:'APP_SECRET',accessKey:'ACCESS_SECRET',affiliateId:'AFF_SECRET',
  checkedAt:'2026-11-16',
  fetchFn:async(request,{method,headers})=>{
    assert.equal(method,'GET');
    assert.equal(headers.accessKey,'ACCESS_SECRET');
    assert.ok(String(request).includes('APP_SECRET'));
    return {ok:true,json:async()=>payload};
  }
 });
 assert.equal(JSON.stringify(r).includes('APP_SECRET'),false);
 assert.equal(JSON.stringify(r).includes('ACCESS_SECRET'),false);
 assert.equal(r.status,'needs_product_detail_research');
});
test('API-only data never automatically becomes publication candidate',()=>{
 const e=rakutenEditorialEvidence(payload,'shop:001',{checkedAt:'2026-11-16'});
 const r=buildEditorialArticleWorkflow({ranking:[candidate],apiEvidenceByItemCode:{'shop:001':e}});
 assert.equal(r.summary.researchRequired,1);
 assert.equal(r.summary.reviewCandidates,0);
});
test('explicit source review can create offline article candidate',()=>{
 const e=rakutenEditorialEvidence(payload,'shop:001',{checkedAt:'2026-11-16'});
 const r=buildEditorialArticleWorkflow({ranking:[candidate],apiEvidenceByItemCode:{'shop:001':e},
  productPageReviewsByItemCode:{'shop:001':review()}});
 assert.equal(r.summary.reviewCandidates,1);
 assert.match(r.entries[0].article,/寸法記載/);
 assert.equal(r.entries[0].publishApproved,false);
});
test('mismatched or insufficient page evidence is held',()=>{
 const e=rakutenEditorialEvidence(payload,'shop:001',{checkedAt:'2026-11-16'});
 const bad=review();bad.sourceUrl='https://example.com/unrelated';
 assert.equal(assembleEditorialResearch(candidate,e,bad).status,'research_required');
 const short=review();short.specs=short.specs.slice(0,1);
 assert.equal(assembleEditorialResearch(candidate,e,short).reason,'product_specs_insufficient');
});
