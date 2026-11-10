import test from 'node:test';
import assert from 'node:assert/strict';
import {draftMagazineIssue,reviewArticle} from '../src/magazine-writing-workflow.js';
test('writer receives editorial brief before review; publication is never enabled',async()=>{
 const r=await draftMagazineIssue('2026-11-11','19:30',{search:async()=>[],writer:async b=>{
  assert.ok(b.topic);assert.ok(b.instructions.length);return '道具を選ぶ前に、今の不便を一つ整理してみたい。\n置き場所を測るだけでも、選択肢は変わります。';
 }});
 assert.equal(r.status,'manual_editorial_review_required');assert.equal(r.publicationAllowed,false);
});
test('missing writer is explicit; unsupported claims and duplicate lines rejected',async()=>{
 const r=await draftMagazineIssue('2026-11-11','19:30',{search:async()=>[]});
 assert.equal(r.status,'writer_not_configured');
 assert.equal(reviewArticle('使ってみた。絶対に便利').status,'rejected');
 assert.equal(reviewArticle('同じ文章\n同じ文章').status,'rejected');
 assert.equal(reviewArticle('https://example.com').status,'rejected');
});
