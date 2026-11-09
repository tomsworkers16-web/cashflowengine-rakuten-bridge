import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { editorialGuide, researchLane, researchSort, researchScore } from '../src/editorial-strategy.js';

test('reader guide is informative, diverse and not a covert affiliate post',()=>{
 const posts=Array.from({length:14},(_,i)=>editorialGuide('2026-11-'+String(i+1).padStart(2,'0'),'07:30'));
 assert.equal(new Set(posts).size,14);
 for(const p of posts){
  assert.ok(p.length>40&&p.length<500);
  assert.doesNotMatch(p,/こんなの見つけた|【PR】|楽天|https?:\/\/|使ってみた|絶対買う/);
 }
});
test('research lanes rotate but never claim verified sales growth',()=>{
 const lanes=Array.from({length:10},(_,i)=>researchLane('2026-11-'+String(i+1).padStart(2,'0')));
 assert.ok(lanes.includes('niche_proxy'));
 assert.ok(lanes.includes('popular_proxy'));
 assert.ok(lanes.includes('emerging_proxy'));
 assert.equal(researchSort('niche_proxy'),'standard');
 assert.equal(researchSort('emerging_proxy'),'-updateTimestamp');
 assert.equal(researchSort('popular_proxy'),'-reviewCount');
 const niche={price:4200,reviewAverage:4.5,reviewCount:120};
 const veryPopular={...niche,reviewCount:2500};
 assert.ok(researchScore(niche,'niche_proxy')>researchScore(veryPopular,'niche_proxy'));
 assert.ok(researchScore(veryPopular,'popular_proxy')>researchScore(niche,'popular_proxy'));
});
test('M8 guide slots bypass product lookup and retain explicit policy tag',()=>{
 const core=fs.readFileSync(new URL('../src/local-core-v2.js',import.meta.url),'utf8');
 assert.match(core,/role === 'guide' \? editorialGuide/);
 assert.match(core,/role!=='guide' && rakutenCooldownRemaining/);
 assert.match(core,/researchLaneEvidence:'proxy_not_verified_sales'/);
});
