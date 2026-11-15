import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedXmlMetadata,collectXmlFeedDemand} from '../src/magazine-xml-feed-demand.js';
const rss=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>暮らし</title>
<item><title><![CDATA[キッチンの水切りラックを考える]]></title><link>https://example.org/a</link><description>本文は保持しない</description></item>
<item><title>防寒のアイデア &amp; ひざ掛け</title><link>https://example.org/b</link></item></channel></rss>`;
const atom=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>洗面台の排水口を掃除したい</title><link rel="alternate" href="https://example.org/wash"/>
<content>本文は保存しない</content></entry></feed>`;
test('RSS metadata is parsed and body never retained',()=>{
 const got=parseFeedXmlMetadata(rss);
 assert.equal(got.items.length,2);
 assert.equal(got.items[1].title,'防寒のアイデア & ひざ掛け');
 assert.ok(!JSON.stringify(got).includes('本文'));
});
test('Atom alternate links parse correctly and no article body is retained',()=>{
 const got=parseFeedXmlMetadata(atom);
 assert.equal(got.items.length,1);
 assert.equal(got.items[0].url,'https://example.org/wash');
 assert.ok(!JSON.stringify(got).includes('本文'));
});
test('rejects DTD / entities and unsupported XML',()=>{
 assert.throws(()=>parseFeedXmlMetadata('<!DOCTYPE rss [<!ENTITY xx SYSTEM "file:///etc/passwd">]><rss/>'),/feed_xml_unsafe/);
 assert.throws(()=>parseFeedXmlMetadata('<response><item/></response>'),/feed_xml_unsupported/);
});
test('collects only approved HTTPS same-host headlines, no publication',async()=>{
 const r=await collectXmlFeedDemand({day:'2026-11-16',now:()=> '2026-11-16T01:00:00Z',
  feeds:[{enabled:true,url:'https://example.org/rss.xml',allowedDomain:'example.org'}],
  fetchImpl:async(u,o)=>{assert.equal(o.redirect,'error');return {ok:true,headers:{get:()=>null},text:async()=>rss};}});
 assert.equal(r.accepted,2);
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.automaticPost,false);
 assert.equal(r.signals[0].topicId,'kitchen-cleanup');
});
test('blocks unexpected hosts and internal URLs',async()=>{
 let called=0;
 const got=await collectXmlFeedDemand({day:'2026-11-16',feeds:[{enabled:true,url:'https://localhost/feed.xml',allowedDomain:'localhost'},
 {enabled:true,url:'https://example.org/rss.xml',allowedDomain:'another.org'}],
 fetchImpl:async()=>{called++;throw Error('no fetch');}});
 assert.equal(called,0);assert.equal(got.accepted,0);
});
