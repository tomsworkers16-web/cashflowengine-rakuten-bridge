import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {eligibleStock,readProductStock,addProductStock,reserveResearch,researchPhase,summarizeEditorialAlert} from '../src/editorial-resilience.js';
import {planThreadsDailyCycle} from '../src/threads-daily-cycle.js';
const day='2026-11-26',item={itemCode:'shop:1',itemName:'収納チェスト ラック',rank:2,price:4999,hasAffiliateUrl:true};
const page='https://item.rakuten.co.jp/shop/chest/';
const product=planThreadsDailyCycle({jstDate:day,ranking:[item],researchByItemCode:{[item.itemCode]:{itemCode:item.itemCode,productPageUrl:page,affiliateUrl:'https://hb.afl.rakuten.co.jp/ichiba/example/?pc='+encodeURIComponent(page),rights:{noMedia:true},facts:[{id:'dimensions',claim:'引き出しの内幅は26cmと記載',sourceUrl:page,checkedAt:day,evidenceQuote:'引き出し内幅26cm'},{id:'material',claim:'材質はポリプロピレンと記載',sourceUrl:page,checkedAt:day,evidenceQuote:'材質 ポリプロピレン'}]}}});
test('stock only stores candidates from qualified current plans, expires after seven days',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-stock-'));
 try{assert.equal(addProductStock(dir,{...product,stockCandidate:{...item,itemCode:'other:1'}},day),false);assert.equal(addProductStock(dir,{...product,stockCandidate:item},day),true);assert.equal(addProductStock(dir,{...product,stockCandidate:item},day),true);assert.equal(readProductStock(dir,'2026-11-27').length,1);assert.equal(readProductStock(dir,'2026-12-04').length,0);assert.equal(eligibleStock([{checkedAt:'2026-11-27',candidate:item}],day).length,0);assert.equal(readProductStock(dir,day)[0].candidate.affiliateUrl,undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('research reservation survives restart and phase is limited to approved windows',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-reserve-'));try{assert.equal(researchPhase(17*60+30),'evening');assert.equal(researchPhase(18*60),null);assert.equal(researchPhase(23*60+15),'stock');assert.equal(reserveResearch(dir,day,'evening'),true);assert.equal(reserveResearch(dir,day,'evening'),false);assert.equal(reserveResearch(dir,day,'stock'),true);assert.equal(reserveResearch(dir,day,'../bad'),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('alerts only count missed windows and use latest durable result, never pending history as failure',()=>{
 const journal=[{jstDate:day,slot:'07:30',meta:{publishStatus:'pending'}},{jstDate:day,slot:'07:30',id:'x',meta:{publishStatus:'posted'}}];
 assert.deepEqual(summarizeEditorialAlert({jstDate:day,minutes:13*60,plan:{jstDate:day,status:'research_required',reason:'no_qualified_product'},journal}).missedSlots,['12:30']);
 assert.deepEqual(summarizeEditorialAlert({jstDate:day,minutes:7*60+35,plan:{jstDate:day,status:'batch_review_required'},journal:[]}).missedSlots,[]);
});
