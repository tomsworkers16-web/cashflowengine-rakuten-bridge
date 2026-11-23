import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriterHandoff,reviewWriterHandoff} from '../src/magazine-writer-handoff.js';
test('handoff includes topic, editorial instructions and length guidance',()=>{
 const h=createWriterHandoff('2026-11-11');
 assert.ok(h.topicId);assert.ok(h.prompt.includes('300〜480字'));assert.ok(h.prompt.includes(h.brief.topic));
 const r=reviewWriterHandoff(h,'道具を選ぶときは、使い終わった後のことも考えたい。');
 assert.equal(r.status,'manual_editorial_review_required');assert.equal(r.publicationAllowed,false);
});
test('invalid handoff or unsupported claims cannot publish',()=>{
 assert.equal(reviewWriterHandoff({},'test').status,'invalid_handoff');
 const r=reviewWriterHandoff(createWriterHandoff('2026-11-11'),'使ってみた。絶対に便利。');
 assert.equal(r.status,'rejected');assert.equal(r.article,null);
});
