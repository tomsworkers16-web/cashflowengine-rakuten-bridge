import test from 'node:test';
import assert from 'node:assert/strict';
import {assessEditorialQuality,QUALITY_WEIGHTS} from '../src/magazine-editorial-quality-gate.js';
const article='水切りかごを選ぶ前に確認したいのは排水の向き。シンクとの位置関係を測ると、後片付けがしやすい製品を比較できます。';
const valid={decision:'accept',qualityScores:{newInsight:25,practicalSpecificity:23,factualSupport:17,naturalWriting:14,productFit:9},
 insightStatement:'食器の収納力だけでなく、排水の向きが日々の片付けに影響する',
 actionableTakeaway:'買う前に自宅のシンクの左右位置と製品トレーの排水方向を照合する',
 claimChecks:[{claim:'水切りラックの排水方向は設置向きと関連する',status:'source_verified',sourceUrl:'https://example.org/product'}]};
test('requires insight, real practical criteria, supported claims and manual approval',()=>{
 assert.deepEqual(QUALITY_WEIGHTS,{newInsight:30,practicalSpecificity:25,factualSupport:20,naturalWriting:15,productFit:10});
 const got=assessEditorialQuality(valid,{article});
 assert.equal(got.status,'quality_passed_for_owner_review');assert.equal(got.total,88);
 assert.equal(got.publicationAllowed,false);assert.equal(got.performanceEvidence,'not_measured');
});
test('obvious sympathetic article is rejected even when reviewer gives it a high aggregate',()=>{
 const got=assessEditorialQuality({...valid,qualityScores:{...valid.qualityScores,newInsight:10,practicalSpecificity:25,naturalWriting:15,factualSupport:20,productFit:10}},{article});
 assert.equal(got.total,80);assert.equal(got.qualityAccepted,false);
 assert.ok(got.reasons.includes('new_insight_too_weak'));
});
test('unverified claims cannot pass simply through generous self-scoring',()=>{
 const got=assessEditorialQuality({...valid,claimChecks:[{claim:'トレーの排水はどんな設置でも完全に流れる',status:'needs_verification'}]},{article});
 assert.ok(got.reasons.includes('claims_need_verification'));assert.equal(got.qualityAccepted,false);
});
test('missing review or invalid point scale is rejected',()=>{
 assert.equal(assessEditorialQuality({}, {article}).qualityAccepted,false);
 assert.ok(assessEditorialQuality({...valid,qualityScores:{...valid.qualityScores,newInsight:31}},{article}).reasons.includes('quality_scores_missing_or_invalid'));
});
test('a good score alone is insufficient without concrete described learning',()=>{
 const got=assessEditorialQuality({...valid,insightStatement:'便利',actionableTakeaway:''},{article});
 assert.ok(got.reasons.includes('insight_or_takeaway_not_explained'));
});
