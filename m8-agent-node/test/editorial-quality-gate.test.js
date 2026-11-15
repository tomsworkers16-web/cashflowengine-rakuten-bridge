import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEditorialDraft, revisionRequest } from '../src/editorial-quality-gate.js';

const good = () => ({
  reader: { problem:'水切りかごを置くと蛇口に当たりそう', context:'狭い賃貸キッチンで二人分の食器を洗う' },
  purchaseChecks: [
    {risk:'蛇口に干渉する', howToCheck:'蛇口の可動域と商品の外寸を測る'},
    {risk:'水がシンク外へ流れる', howToCheck:'排水方向と設置向きを確認する'},
    {risk:'洗いにくい', howToCheck:'トレーの着脱と洗浄方法を確認する'}
  ],
  comparisonMethod:'寸法・排水方向・掃除のしやすさを同じ表にまとめる',
  goodFor:'蛇口と干渉しない設置場所がある人',
  notGoodFor:'排水方向が合わない人',
  verifiedFacts:[{id:'size',claim:'商品ページの外寸',sourceUrl:'https://example.com/item',checkedAt:'2026-11-16'}],
  productClaims:[{text:'外寸を要確認',factId:'size'}],
  isAffiliate:true,disclosure:'【PR】楽天アフィリエイト',affiliateUrl:'https://example.com/affiliate',
  fabricatedExperience:false,unverifiedPerformance:false,mediaRightsVerified:true
});

test('pass structured, sourced and disclosed draft only as review candidate',()=>{
 const result=evaluateEditorialDraft(good());
 assert.equal(result.total,12);
 assert.equal(result.status,'review_candidate');
 assert.equal(result.publishApproved,false);
});
test('reject generic shallow draft and request actionable changes',()=>{
 const draft=good();
 draft.purchaseChecks=[{risk:'サイズに注意',howToCheck:'測る'}];
 draft.comparisonMethod='';
 const result=evaluateEditorialDraft(draft);
 assert.equal(result.status,'revision_required');
 assert.ok(result.issues.some(i=>i.code==='purchase_checks_insufficient'));
 assert.ok(revisionRequest(draft,result).requiredChanges.length>0);
});
test('unverifiable performance claim blocks even high scores',()=>{
 const draft=good();
 draft.productClaims.push({text:'すごく長持ちする',factId:'missing'});
 assert.equal(evaluateEditorialDraft(draft).status,'revision_required');
});
test('missing affiliate disclosure blocks',()=>{
 const draft=good(); draft.disclosure='';
 assert.equal(evaluateEditorialDraft(draft).status,'revision_required');
});
test('fabricated experience and unchecked media block',()=>{
 const draft=good(); draft.fabricatedExperience=true; draft.mediaRightsVerified=false;
 const result=evaluateEditorialDraft(draft);
 assert.equal(result.status,'revision_required');
 assert.ok(result.issues.some(i=>i.code==='fabricated_experience'));
});
test('non-affiliate advice can pass without marketing link',()=>{
 const draft=good(); draft.isAffiliate=false;draft.disclosure='';draft.affiliateUrl='';
 const result=evaluateEditorialDraft(draft);
 assert.equal(result.status,'review_candidate');
});
test('invalid input rejected',()=>assert.throws(()=>evaluateEditorialDraft(null),/draft_object_required/));
