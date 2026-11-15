import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditorialArticleWorkflow, recheckEditorialArticle } from '../src/editorial-article-workflow.js';
const item = { itemCode:'shop:001', itemName:'水切りかご ステンレス 収納', price:3500, rank:2, hasAffiliateUrl:true };
function draft() { return {
  itemCode:'shop:001', title:'水切りかご選びで見落としやすい3点',
  reader:{problem:'水切りかごが蛇口と干渉する不安',context:'小さなキッチンで二人暮らし'},
  purchaseChecks:[
    {risk:'蛇口が当たる',howToCheck:'蛇口の可動域を測る'},
    {risk:'排水方向が合わない',howToCheck:'シンクの方向を確認する'},
    {risk:'掃除が大変',howToCheck:'トレーの着脱方式を確認する'}
  ],
  comparisonMethod:'外寸・排水方向・手入れ方法を表にする',
  goodFor:'設置寸法が合う人',notGoodFor:'蛇口に干渉する人',
  verifiedFacts:[{id:'spec',claim:'公式商品ページに外寸の記載あり',sourceUrl:'https://example.com/spec',checkedAt:'2026-11-16'}],
  productClaims:[{text:'外寸が掲載されている',factId:'spec'}],
  isAffiliate:true,disclosure:'【PR】',affiliateUrl:'https://example.com/affiliate',
  fabricatedExperience:false,unverifiedPerformance:false,mediaRightsVerified:true
};}
test('candidate without verified research is not an article', () => {
 const r=buildEditorialArticleWorkflow({ranking:[item]});
 assert.equal(r.summary.researchRequired,1);
 assert.equal(r.summary.published,0);
 assert.equal(r.entries[0].article,undefined);
});
test('full draft produces offline review-only article', () => {
 const r=buildEditorialArticleWorkflow({ranking:[item],draftsByItemCode:{'shop:001':draft()}});
 assert.equal(r.summary.reviewCandidates,1);
 assert.match(r.entries[0].article,/蛇口の可動域を測る/);
 assert.match(r.entries[0].article,/【PR】/);
 assert.equal(r.entries[0].publishApproved,false);
});
test('wrong item identity blocks article rendering', () => {
 const d=draft();d.itemCode='other:999';
 const r=buildEditorialArticleWorkflow({ranking:[item],draftsByItemCode:{'shop:001':d}});
 assert.equal(r.entries[0].status,'revision_required');
 assert.equal(r.entries[0].article,undefined);
});
test('shallow article can be rejected and resubmitted', () => {
 const d=draft();d.purchaseChecks=[d.purchaseChecks[0]];
 const first=buildEditorialArticleWorkflow({ranking:[item],draftsByItemCode:{'shop:001':d}});
 assert.equal(first.summary.revisionRequired,1);
 assert.ok(first.entries[0].revision.requiredChanges.length);
 const next=recheckEditorialArticle(first.entries[0].candidate,draft());
 assert.equal(next.summary.reviewCandidates,1);
 assert.equal(next.summary.published,0);
});
test('unsupported product claims prevent article rendering', () => {
 const d=draft();d.productClaims.push({text:'未確認の断定',factId:'notverified'});
 const r=buildEditorialArticleWorkflow({ranking:[item],draftsByItemCode:{'shop:001':d}});
 assert.equal(r.entries[0].status,'revision_required');
 assert.equal(r.entries[0].article,null);
});
