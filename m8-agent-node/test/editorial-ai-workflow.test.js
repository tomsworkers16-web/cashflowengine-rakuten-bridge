import test from 'node:test';
import assert from 'node:assert/strict';
import {runEditorialAiWorkflow} from '../src/editorial-ai-workflow.js';
import {rakutenEditorialEvidence} from '../src/editorial-rakuten-evidence.js';

const item={itemCode:'shop:001',itemName:'水切りかご 収納',price:3500,rank:3,hasAffiliateUrl:true};
const evidence=rakutenEditorialEvidence({Items:[{Item:{
 itemCode:'shop:001',itemName:item.itemName,itemPrice:3500,
 itemUrl:'https://item.rakuten.co.jp/e-kurashi/s1u57/',affiliateUrl:'https://example.com/a'
}}]},item.itemCode,{checkedAt:'2026-11-16'});
const review={itemCode:item.itemCode,reviewed:true,sourceUrl:'https://item.rakuten.co.jp/e-kurashi/s1u57/',
 checkedAt:'2026-11-16',specs:[
 {id:'s1',claim:'寸法記載',quote:'幅30cm',sourceUrl:'https://item.rakuten.co.jp/e-kurashi/s1u57/',reviewed:true},
 {id:'s2',claim:'材質記載',quote:'ステンレス',sourceUrl:'https://item.rakuten.co.jp/e-kurashi/s1u57/',reviewed:true}
]};
const output={
 title:'水切りかごの失敗しない選び方',
 reader:{problem:'蛇口と干渉する可能性',context:'狭いキッチンで二人暮らし'},
 purchaseChecks:[
 {risk:'蛇口と干渉',howToCheck:'高さを測る'},
 {risk:'排水方向',howToCheck:'シンクへの流れを確認'},
 {risk:'手入れ',howToCheck:'トレーの取り外し方を見る'}
 ],
 comparisonMethod:'外寸と排水方向と手入れを比較表にする',
 goodFor:'設置条件に合う人',notGoodFor:'条件が合わない人'
};
const opts={ranking:[item],apiEvidenceByItemCode:{'shop:001':evidence},
 productPageReviewsByItemCode:{'shop:001':review}};
test('model creates review-only article from sourced packet',async()=>{
 const result=await runEditorialAiWorkflow({...opts,generateFn:async()=>output});
 assert.equal(result.mode,'ai_draft_offline_review_only');
 assert.equal(result.summary.reviewCandidates,1);
 assert.equal(result.summary.published,0);
 assert.match(result.entries[0].article,/【PR】/);
 assert.equal(result.entries[0].publishApproved,false);
});
test('without a model fails closed',async()=>{
 const result=await runEditorialAiWorkflow(opts);
 assert.equal(result.summary.modelNotConnected,1);
 assert.equal(result.summary.reviewCandidates,0);
 assert.equal(result.entries[0].article,null);
});
test('without product page review fails closed',async()=>{
 const result=await runEditorialAiWorkflow({...opts,productPageReviewsByItemCode:{},generateFn:async()=>output});
 assert.equal(result.summary.researchRequired,1);
 assert.equal(result.summary.reviewCandidates,0);
});
test('bad model draft does not become generic article',async()=>{
 const result=await runEditorialAiWorkflow({...opts,generateFn:async()=>({title:'何でもおすすめ',purchaseChecks:[]})});
 assert.equal(result.summary.revisionRequired,1);
 assert.equal(result.summary.reviewCandidates,0);
 assert.equal(result.entries[0].article,null);
});
