import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import {runMagazineWritingPilot} from '../src/magazine-writing-pilot.js';
async function snapshot(){
 const day='2026-11-11';
 const capture=captureListingSearch(async keyword=>keyword.includes('水切り')?[{itemCode:'shop:low',itemName:'水切りラック',price:1900,reviewCount:100,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=a'},{itemCode:'shop:high',itemName:'水切りラック 2段',price:10800,reviewCount:100,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=b'}]:[],{day});
 await discoverRevenueOpportunity(day,'19:30',{search:capture.search,includeSeasonal:true});
 return capture.snapshot();
}
test('writer and reviewer are invoked for both exact products without enabling publishing',async()=>{
 const calls=[];
 const x=await runMagazineWritingPilot(await snapshot(),{writer:async brief=>{calls.push(brief.itemCode);assert.ok(brief.maxBodyCharacters>40);return '洗い物を置く場所、まずシンクの幅を測ってみませんか？';},reviewer:async ({itemCode})=>({decision:'accept',itemCode})});
 assert.deepEqual(calls,['shop:low','shop:high']);
 assert.equal(x.status,'drafts_ready_for_manual_review');assert.equal(x.publicationAllowed,false);
 assert.ok(x.entries.every(e=>e.draft.text.length<=500&&e.draft.publicationAllowed===false));
});
test('missing provider, rejected copy, wrong item review and provider failures never create commercial text',async()=>{
 const snap=await snapshot();
 assert.equal((await runMagazineWritingPilot(snap)).status,'provider_not_configured');
 const rejected=await runMagazineWritingPilot(snap,{writer:async()=> '実際に使ってみた。',reviewer:async()=>{throw Error('must not call');}});
 assert.ok(rejected.entries.every(e=>e.status==='writer_output_rejected'));
 const wrong=await runMagazineWritingPilot(snap,{writer:async()=> 'シンクの幅を測って選びたい。',reviewer:async()=>({decision:'accept',itemCode:'wrong'})});
 assert.ok(wrong.entries.every(e=>e.status==='editorial_revision_required'));
 const failure=await runMagazineWritingPilot(snap,{writer:async()=>{throw Error('provider secret');},reviewer:async()=>({})});
 assert.ok(failure.entries.every(e=>e.status==='writer_or_reviewer_failed'));assert.ok(!JSON.stringify(failure).includes('provider secret'));
});
