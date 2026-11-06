import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordRelevanceBonus} from '../src/product-relevance.js';

test('bounded topic match prioritizes a relevant product name',()=>{
 assert.equal(keywordRelevanceBonus('収納 便利グッズ','キッチン収納ラック'),10);
 assert.equal(keywordRelevanceBonus('収納 便利グッズ','スマートウォッチ'),0);
 assert.equal(keywordRelevanceBonus('便利グッズ','収納ラック'),0);
 assert.equal(keywordRelevanceBonus('掃除 換気扇','換気扇 掃除用品'),15);
});
test('untrusted listing and empty keyword do not produce unbounded score',()=>{
 assert.equal(keywordRelevanceBonus('','洗面台 ヘアーキャッチャー'),0);
 assert.equal(keywordRelevanceBonus('掃除','掃除'.repeat(1000)),10);
 assert.equal(keywordRelevanceBonus('換気扇 便利グッズ','換気扇フィルター'),10);
});
