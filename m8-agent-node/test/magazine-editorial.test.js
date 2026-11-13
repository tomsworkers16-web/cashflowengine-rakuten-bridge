import test from 'node:test';
import assert from 'node:assert/strict';
import {planMagazineIssue} from '../src/magazine-editorial.js';
test('editorial topic precedes product selection; same topic short and feature have meaningful length variation',()=>{
 const a=planMagazineIssue('2026-11-11','07:30'),b=planMagazineIssue('2026-11-11','19:30');
 assert.equal(a.topicId,b.topicId);
 assert.equal(b.format,'feature');
 assert.ok(b.characters>a.characters*2);
 assert.ok(b.characters<=500);
 assert.equal(b.productSelection,'not_performed');
 assert.equal(b.status,'preview_only');
 assert.ok(!b.text.includes('https://'));
});
test('rotates editorial briefs and keeps previews valid',()=>{
 const days=['2026-11-11','2026-11-12','2026-11-13'];
 const issues=days.map(d=>planMagazineIssue(d));
 assert.equal(new Set(issues.map(x=>x.topicId)).size,3);
 for(const x of issues)assert.ok(x.characters<=500&&x.researchKeyword);
 assert.throws(()=>planMagazineIssue('bad'),/invalid_issue_date/);
});
