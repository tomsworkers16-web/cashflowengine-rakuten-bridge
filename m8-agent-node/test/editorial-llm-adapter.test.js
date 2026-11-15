import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditorialLlmRequest,draftArticleWithModel} from '../src/editorial-llm-adapter.js';

const candidate={itemCode:'shop:1',itemName:'水切りかご 収納'};
const research={itemCode:'shop:1',affiliateUrl:'https://example.com/a',rights:{noMedia:true},
  facts:[{id:'source-spec',claim:'出品ページで寸法記載を確認',sourceUrl:'https://example.com/spec',checkedAt:'2026-11-16'}]};
const output=()=>({
 title:'水切りかごを選ぶ際の3つの盲点',
 reader:{problem:'蛇口に干渉するか心配',context:'狭い台所で二人暮らし'},
 purchaseChecks:[
  {risk:'蛇口との干渉',howToCheck:'高さと蛇口可動範囲を測る'},
  {risk:'排水向き',howToCheck:'シンク方向と排水路を確認'},
  {risk:'掃除の手間',howToCheck:'トレーの外し方を確認'}
 ],
 comparisonMethod:'外寸・排水・手入れの項目を一覧化する',
 goodFor:'寸法や向きを確認できる人',
 notGoodFor:'寸法が合わない人'
});
test('LLM prompt only provides source facts and neutral instructions',()=>{
 const r=buildEditorialLlmRequest(candidate,research);
 assert.equal(r.status,'ready_for_model');
 assert.equal(r.data.verifiedFacts[0].id,'source-spec');
 assert.equal(r.publishApproved,false);
});
test('model cannot override product facts or affiliate link',async()=>{
 const r=await draftArticleWithModel(candidate,research,{generateFn:async()=>{
   const m=output();
   m.verifiedFacts=[{id:'fake',claim:'保証される',sourceUrl:'https://fake.example'}];
   m.affiliateUrl='https://attacker.example';
   m.itemCode='other:1';
   m.mediaRightsVerified=false;
   return m;
 }});
 assert.equal(r.status,'review_candidate');
 assert.equal(r.draft.itemCode,'shop:1');
 assert.equal(r.draft.affiliateUrl,'https://example.com/a');
 assert.equal(r.draft.verifiedFacts[0].id,'source-spec');
 assert.equal(r.publishApproved,false);
});
test('structural deficiency is retried once with feedback',async()=>{
 let count=0;
 const r=await draftArticleWithModel(candidate,research,{limit:2,generateFn:async({feedback})=>{
   count++;
   if(count===1)return {...output(),purchaseChecks:[]};
   assert.ok(feedback.length>0);
   return output();
 }});
 assert.equal(count,2);
 assert.equal(r.status,'review_candidate');
 assert.equal(r.attempt,2);
});
test('no model connection or no research never publishes',async()=>{
 assert.equal((await draftArticleWithModel(candidate,research)).status,'model_not_connected');
 assert.equal((await draftArticleWithModel(candidate,{...research,facts:[]},{generateFn:async()=>output()})).status,'research_required');
});
test('invalid JSON returns revision_required after bounded attempts',async()=>{
 const r=await draftArticleWithModel(candidate,research,{limit:2,generateFn:async()=>'{invalid'});
 assert.equal(r.status,'revision_required');
 assert.equal(r.attempts,2);
});
