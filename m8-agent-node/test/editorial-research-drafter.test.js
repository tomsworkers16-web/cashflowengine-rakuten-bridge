import test from 'node:test';
import assert from 'node:assert/strict';
import {draftFromResearch} from '../src/editorial-research-drafter.js';
import {buildEditorialArticleWorkflow,reviseEditorialArticleFromResearch} from '../src/editorial-article-workflow.js';

const item={itemCode:'sample:001',itemName:'水切りかご 収納',rank:3,price:3500,hasAffiliateUrl:true};
const research=()=>({
 itemCode:'sample:001',affiliateUrl:'https://example.com/affiliate',
 rights:{noMedia:true},
 facts:[{id:'spec',claim:'販売ページに寸法の記載あり',sourceUrl:'https://example.com/item',checkedAt:'2026-11-16'}]
});
test('sourced research generates review candidate without publishing',()=>{
 const r=buildEditorialArticleWorkflow({ranking:[item],researchByItemCode:{'sample:001':research()}});
 assert.equal(r.summary.reviewCandidates,1);
 assert.equal(r.summary.published,0);
 assert.equal(r.entries[0].draftOrigin,'research_template');
 assert.match(r.entries[0].article,/購入前に確認したいこと/);
 assert.equal(r.entries[0].publishApproved,false);
});
test('ranking-only and source-free research never become articles',()=>{
 const a=buildEditorialArticleWorkflow({ranking:[item]});
 assert.equal(a.summary.researchRequired,1);
 const bad={...research(),facts:[]};
 const b=buildEditorialArticleWorkflow({ranking:[item],researchByItemCode:{'sample:001':bad}});
 assert.equal(b.summary.researchRequired,1);
});
test('incorrect product identity or missing affiliate URL is held',()=>{
 const bad={...research(),itemCode:'wrong:2'};
 assert.equal(draftFromResearch(item,bad).status,'research_required');
 const missing={...research(),affiliateUrl:null};
 assert.equal(draftFromResearch(item,missing).status,'research_required');
});
test('missing explicit no-media declaration is held',()=>{
 assert.equal(draftFromResearch(item,{...research(),rights:{}}).status,'research_required');
});
test('safe revision regenerates shallow article from supplied evidence once',()=>{
 const d=draftFromResearch(item,research()).draft;
 d.purchaseChecks=d.purchaseChecks.slice(0,1);
 const r=reviseEditorialArticleFromResearch(item,d,research());
 assert.equal(r.status,'review_candidate');
 assert.equal(r.recheckCount,1);
 assert.equal(r.publishApproved,false);
});
test('fabricated experience cannot be washed away by revision',()=>{
 const d=draftFromResearch(item,research()).draft;
 d.fabricatedExperience=true;
 const r=reviseEditorialArticleFromResearch(item,d,research());
 assert.equal(r.status,'revision_required');
 assert.equal(r.reason,'manual_evidence_review_required');
});


test('real-source chest variants are used in buying guidance, not only fact appendix',()=>{
 const candidate={itemCode:'e-kurashi:10048736',itemName:'コロ脚 壁付き チェスト 幅34/54 奥行41.5/41.7 高さ66.1cm 収納ケース',rank:24,price:4999,hasAffiliateUrl:true};
 const sourceUrl='https://item.rakuten.co.jp/e-kurashi/s1u57/';
 const claims=[
  ['slim_drawer_inner_dimensions','スリムサイズの引出し内寸は幅26×奥行36×深さ16cmと記載'],
  ['wide_drawer_inner_dimensions','ワイドサイズの引出し内寸は幅46×奥行36×深さ16cmと記載'],
  ['slim_load_capacity','スリムサイズの耐荷重は天板約2kg、引出し1段あたり約2kgと記載'],
  ['wide_load_capacity','ワイドサイズの耐荷重は天板約3kg、引出し1段あたり約3kgと記載'],
  ['assembly_duration','組立時間は約20-30分と記載']
 ];
 const packet={itemCode:candidate.itemCode,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/demo/',rights:{noMedia:true},
   facts:claims.map(([id,claim])=>({id,claim,sourceUrl,checkedAt:'2026-11-20'}))};
 const d=draftFromResearch(candidate,packet).draft;
 assert.match(d.title,/内寸・耐荷重・組み立て/);
 assert.doesNotMatch(d.title,/高さ66\.1cm/);
 assert.match(d.purchaseChecks[1].howToCheck,/幅26×奥行36×深さ16cm/);
 assert.match(d.purchaseChecks[1].howToCheck,/幅46×奥行36×深さ16cm/);
 assert.match(d.purchaseChecks[2].howToCheck,/約2kg/);
 assert.match(d.purchaseChecks[2].howToCheck,/約3kg/);
 const result=buildEditorialArticleWorkflow({ranking:[candidate],researchByItemCode:{[candidate.itemCode]:packet}});
 assert.equal(result.summary.reviewCandidates,1);
 assert.match(result.entries[0].article,/幅26×奥行36×深さ16cm/);
 assert.equal(result.summary.published,0);
 const missing={...packet,facts:packet.facts.filter(f=>f.id!=='wide_load_capacity')};
 const fallback=draftFromResearch(candidate,missing).draft;
 assert.doesNotMatch(fallback.purchaseChecks[1].howToCheck,/幅46×奥行36×深さ16cm/);
});
