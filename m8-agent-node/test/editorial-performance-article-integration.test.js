import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEditorialShortlist } from '../src/editorial-shortlist.js';
import { buildEditorialArticleWorkflow } from '../src/editorial-article-workflow.js';
import { runEditorialAiWorkflow } from '../src/editorial-ai-workflow.js';

const candidate=(itemCode,itemName,rank)=>({itemCode,itemName,rank,price:3000,hasAffiliateUrl:true});
const a=candidate('a:1','収納ラック',1), b=candidate('b:1','掃除ブラシ',20), c=candidate('c:1','真空保存容器',11);
const record=(itemCode,changes={})=>({source:'reviewed_item_report',recordId:itemCode,itemCode,clicks:10,orders:1,rewardYen:120,costYen:20,rewardStatus:'confirmed',...changes});

test('absent or empty evidence preserves legacy candidate ordering',()=>{
 const ranking=[a,b,c];
 const legacy=buildEditorialShortlist(ranking,{max:2});
 assert.deepEqual(buildEditorialShortlist(ranking,{max:2,performanceRecords:[]}).selected.map(x=>x.itemCode),legacy.selected.map(x=>x.itemCode));
 assert.equal(legacy.performance,undefined);
});
test('positive evidence can promote an eligible candidate before truncation',()=>{
 const r=buildEditorialShortlist([a,b,c],{max:1,performanceRecords:[record(b.itemCode)]});
 assert.equal(r.selected[0].itemCode,b.itemCode);
 assert.equal(r.selected[0].researchLane,'validated_candidate');
});
test('reserve a compatible experiment even when there are enough positive candidates',()=>{
 const r=buildEditorialShortlist([a,b,c],{max:2,performanceRecords:[record(a.itemCode),record(b.itemCode)]});
 assert.deepEqual(r.selected.map(x=>x.researchLane),['validated_candidate','experiment']);
 assert.equal(r.selected[1].itemCode,c.itemCode);
});
test('negative evidence is deferred without automatically generating an article',()=>{
 const r=buildEditorialArticleWorkflow({ranking:[a,b],performanceRecords:[record(a.itemCode,{costYen:200})]});
 assert.deepEqual(r.entries.map(x=>x.itemCode),[b.itemCode]);
 assert.equal(r.performance.lossReview[0].itemCode,a.itemCode);
 assert.equal(r.summary.published,0);
});
test('daily aggregates and incomplete rewards never replace discovery ranking',()=>{
 const r=buildEditorialShortlist([a,b],{max:1,performanceRecords:[record(b.itemCode,{source:'rakuten_ui_period_daily'}),record(b.itemCode,{rewardStatus:'provisional'})]});
 assert.equal(r.selected[0].itemCode,a.itemCode);
 assert.equal(r.selected[0].researchLane,'experiment');
});
test('performance cannot bypass existing product validation or diversity caps',()=>{
 const invalid={...b,hasAffiliateUrl:false};
 const sameShop=candidate('a:2','掃除ブラシ',3);
 const r=buildEditorialShortlist([a,sameShop,invalid,c],{max:3,performanceRecords:[record(a.itemCode),record(sameShop.itemCode),record(b.itemCode)]});
 assert.ok(!r.selected.some(x=>x.itemCode===b.itemCode));
 assert.equal(r.selected.filter(x=>x.shop==='a').length,1);
});
test('positive performance never bypasses the article research and publication gates',()=>{
 const r=buildEditorialArticleWorkflow({ranking:[a,b],max:1,performanceRecords:[record(b.itemCode)]});
 assert.equal(r.entries[0].itemCode,b.itemCode);
 assert.equal(r.entries[0].status,'research_required');
 assert.equal(r.entries[0].publishApproved,false);
 assert.equal(r.summary.published,0);
});
test('AI generation and rendering use the same performance-aware candidate set',async()=>{
 const r=await runEditorialAiWorkflow({ranking:[a,b,c],max:2,performanceRecords:[record(b.itemCode),record(a.itemCode,{costYen:500})]});
 assert.deepEqual(r.generation.map(x=>x.itemCode),r.entries.map(x=>x.itemCode));
 assert.deepEqual(r.entries.map(x=>x.itemCode),[b.itemCode,c.itemCode]);
 assert.ok(r.entries.every(x=>x.publishApproved===false));
 assert.equal(r.summary.published,0);
});
test('CLI reads reviewed ledger separately without mutating input files',()=>{
 const folder=mkdtempSync(join(tmpdir(),'cfe-evidence-test-'));
 try{
  const input=join(folder,'input.json'),ledger=join(folder,'ledger.json');
  const source=JSON.stringify({records:[record(b.itemCode)]});
  writeFileSync(input,JSON.stringify({ranking:[a,b],max:1}));
  writeFileSync(ledger,source);
  const runner=fileURLToPath(new URL('../src/run-editorial-article-workflow.js',import.meta.url));
  const r=JSON.parse(execFileSync(process.execPath,[runner,input,'--ledger',ledger],{encoding:'utf8'}));
  assert.equal(r.entries[0].itemCode,b.itemCode);
  assert.equal(readFileSync(ledger,'utf8'),source);
  writeFileSync(ledger,'{}');
  assert.throws(()=>execFileSync(process.execPath,[runner,input,'--ledger',ledger],{stdio:'pipe'}),e=>e.status===2);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
