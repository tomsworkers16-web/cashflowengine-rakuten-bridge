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
