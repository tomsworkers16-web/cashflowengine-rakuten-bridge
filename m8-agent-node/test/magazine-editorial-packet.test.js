import test from 'node:test';
import assert from 'node:assert/strict';
import {captureListingSearch} from '../src/magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from '../src/magazine-opportunity.js';
import {buildEditorialPacket} from '../src/magazine-editorial-packet.js';
test('offline packet selects both strategies and refuses unrelated draft binding',async()=>{
 const day='2026-11-11';
 const capture=captureListingSearch(async keyword=>keyword.includes('水切り')?[
 {itemCode:'shop:low',itemName:'水切りラック',price:1900,reviewCount:100,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=a'},
 {itemCode:'shop:high',itemName:'水切りラック 2段',price:10800,reviewCount:100,reviewAverage:4.5,affiliateRate:3,affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test/?pc=b'}]:[],{day});
 await discoverRevenueOpportunity(day,'19:30',{search:capture.search,includeSeasonal:true});
 const packet=await buildEditorialPacket(capture.snapshot(),{articles:[{strategy:'turnoverOriented',itemCode:'shop:low',text:'洗い物の置き場所、まずはシンクの幅を測ってみませんか？'},{strategy:'rewardOriented',itemCode:'shop:wrong',text:'別の商品'}]});
 assert.equal(packet.entries.length,2);assert.equal(packet.comparisonEligible,true);
 assert.equal(packet.entries[0].draft.status,'manual_review_required');
 assert.equal(packet.entries[1].draft,null);assert.equal(packet.publicationAllowed,false);
});
