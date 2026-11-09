import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTheme,evaluateRankingCandidate,buildEditorialShortlist} from '../src/editorial-shortlist.js';
import {runDiscoveryProbe} from '../src/probe-rakuten-discovery.js';

const product=(rank,shop,name,price=3500,affiliate=true)=>({
 rank,itemCode:shop+':'+rank,itemName:name,price,hasAffiliateUrl:affiliate,genreId:'210168'
});

test('recognizes reader utility categories without making performance claims',()=>{
 assert.equal(classifyTheme('キッチン排気口カバー'),'cleaning');
 assert.equal(classifyTheme('真空保存容器'),'food_preservation');
 assert.equal(classifyTheme('透明キッチンマット'),'floor_protection');
 const x=evaluateRankingCandidate(product(4,'kitchenavi','真空保存容器'));
 assert.equal(x.evidenceLevel,'ranking_and_title_only');
 assert.ok(x.requiresVerification.includes('review_context'));
 assert.doesNotMatch(x.editorialAngle,/使って|売れ続け/);
});
test('limits same shop and theme and rejects unsafe entries',()=>{
 const ranked=[
  product(1,'scope','プレート皿'),
  product(2,'scope','ティーカップ'),
  product(3,'kitchen','水切りラック'),
  product(4,'kitchen','収納ホルダー'),
  product(5,'next','透明キッチンマット'),
  product(6,'other','真空保存容器'),
  product(7,'none','掃除ブラシ',3500,false),
  product(8,'filter','換気扇フィルター')
 ];
 const out=buildEditorialShortlist(ranked,{max:5});
 assert.equal(out.selected.length,5);
 assert.equal(new Set(out.selected.map(x=>x.shop)).size,5);
 assert.ok(out.selected.every(x=>x.evidenceLevel==='ranking_and_title_only'));
 assert.equal(out.eligible,7);
 assert.ok(out.selected.some(x=>x.theme==='food_preservation'));
});
test('ranking probe produces separate shortlist without posting',async()=>{
 const ranking=Array.from({length:30},(_,i)=>({
  Item:{rank:30-i,itemCode:'shop'+i+':'+(30-i),itemName:
   ['真空保存容器','水切りラック','透明キッチンマット','換気扇フィルター','収納ホルダー'][i%5],itemPrice:2800,
   affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test'}
 }));
 const fetchFn=async u=>({ok:true,json:async()=>u.pathname.includes('Genre')?
  {genre:{genreId:558944,nameJa:'キッチン用品'},children:[]}: {Items:ranking}});
 const out=await runDiscoveryProbe({applicationId:'app',accessKey:'secret',genreId:558944,fetchFn});
 assert.equal(out.results.ranking.items[0].rank,1);
 assert.ok(out.editorialShortlist.selected.length>0);
 assert.equal(out.postingPerformed,false);
 assert.equal(out.persistencePerformed,false);
 assert.doesNotMatch(JSON.stringify(out),/secret/);
});
