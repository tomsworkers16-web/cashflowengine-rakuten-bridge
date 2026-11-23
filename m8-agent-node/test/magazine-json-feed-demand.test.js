import test from 'node:test';
import assert from 'node:assert/strict';
import {signalsFromJsonFeed,collectJsonFeedDemand} from '../src/magazine-json-feed-demand.js';
const feed='https://example.org/feed.json';
const item=(title,url='https://example.org/articles/cleaning')=>({title,url,content_html:'<b>Copyrighted text should not be retained</b>'});
const payload={version:'https://jsonfeed.org/version/1.1',items:[item('狭い台所の水切りラックを選ぶ'),item('収納の整理整頓を考える','https://example.org/storage'),item('水切りラックと収納を考える','https://example.org/mixed'),item('掃除の悩み','https://evil.example/item')]};
test('collects same-host headlines only, excludes ambiguous or unrelated topics and copyrighted content',()=>{
 const x=signalsFromJsonFeed(payload,{feedUrl:feed,allowedDomain:'example.org',observedAt:'2026-11-15T12:00:00Z'});
 assert.equal(x.length,2);
 assert.deepEqual(x.map(y=>y.topicId),['kitchen-cleanup','storage-flow']);
 assert.ok(x.every(y=>y.url.startsWith('https://example.org/')));
 assert.ok(!JSON.stringify(x).includes('Copyrighted'));
});
test('fetch opt-in only, disabled/config-bad feeds skipped, no publication',async()=>{
 let calls=0;
 const result=await collectJsonFeedDemand({day:'2026-11-15',now:()=> '2026-11-15T12:00:00Z',
 feeds:[{enabled:true,url:feed,allowedDomain:'example.org'}],fetchImpl:async (url,opt)=>{
  calls++;assert.equal(url,feed);assert.equal(opt.redirect,'error');
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(payload)};
 }});
 assert.equal(calls,1);
 assert.equal(result.accepted,2);
 assert.equal(result.fetchedFeedCount,1);
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.automaticPost,false);
});
test('does not fetch internal IP, credentials, redirects or unapproved endpoints',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('should not fetch');};
 const result=await collectJsonFeedDemand({day:'2026-11-15',feeds:[
 {enabled:true,url:'https://127.0.0.1/feed.json',allowedDomain:'127.0.0.1'},
 {enabled:true,url:'https://other.example/feed.json',allowedDomain:'example.org'},
 {enabled:true,url:'https://example.org/feed.json?token=x',allowedDomain:'example.org'},
 {enabled:true,url:'https://example.org:8443/feed.json',allowedDomain:'example.org'}
 ],fetchImpl});
 assert.equal(calls,0);assert.equal(result.accepted,0);
 assert.equal(result.diagnostics.length,4);
});
test('handles feed failure and truncates oversized responses without exposing secrets',async()=>{
 const result=await collectJsonFeedDemand({day:'2026-11-15',feeds:[{enabled:true,url:feed,allowedDomain:'example.org'}],
 fetchImpl:async()=>({ok:true,headers:{get:()=> '500000'},text:async()=>{throw Error('should_not_read');}})});
 assert.equal(result.accepted,0);
 assert.equal(result.diagnostics[0].reason,'feed_too_large');
});
