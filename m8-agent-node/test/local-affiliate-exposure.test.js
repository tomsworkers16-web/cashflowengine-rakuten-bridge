import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {summarizeLocalAffiliateExposure} from '../src/local-affiliate-exposure.js';
import {buildLocalRevenueStatus} from '../src/revenue-status.js';

test('seven-day exposure sums observed affiliate post views without claiming clicks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-exposure-'));
 try{
  const posts=[
   {jstDate:'2026-11-06',slot:'12:30',id:null,meta:{role:'revenue',publishStatus:'pending'}},
   {jstDate:'2026-11-06',slot:'12:30',id:'1001',meta:{role:'revenue',publishStatus:'published'}},
   {jstDate:'2026-11-05',slot:'12:30',id:'1002',meta:{role:'revenue'}},
   {jstDate:'2026-11-05',slot:'07:30',id:'2000',meta:{role:'discovery'}},
   {jstDate:'2026-10-20',slot:'12:30',id:'old',meta:{role:'revenue'}}
  ];
  fs.writeFileSync(path.join(dir,'posts.jsonl'),posts.map(x=>JSON.stringify(x)).join('\n')+'\n');
  fs.mkdirSync(path.join(dir,'reports'));
  fs.writeFileSync(path.join(dir,'reports','2026-11-06-night.json'),JSON.stringify({
   threadsInsights:{posts:[{id:'1001',metrics:{views:11}},{id:'1002',metrics:{views:120}}]}
  }));
  fs.writeFileSync(path.join(dir,'reports','2026-11-05-night.json'),JSON.stringify({
   threadsInsights:{posts:[{id:'1001',metrics:{views:5}},{id:'1002',metrics:{views:'unknown'}}]}
  }));
  const report=summarizeLocalAffiliateExposure(dir,'2026-11-06');
  assert.equal(report.affiliatePosts,2);
  assert.equal(report.publishedPosts,3);
  assert.equal(report.affiliatePostLifetimeViewsObserved,131);
  assert.equal(report.affiliatePostMeanViewsObserved,65.5);
  assert.equal(report.affiliatePostsMissingViews,0);
  assert.equal(report.uncertainPostAttempts,0);
  const status=buildLocalRevenueStatus(dir,Date.parse('2026-11-06T12:00:00Z'));
  assert.equal(status.exposure.affiliatePostLifetimeViewsObserved,131);
  assert.equal(status.sevenDay.rakutenClicks,'unknown');
  assert.ok(!JSON.stringify(status.exposure).includes('https://'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing snapshots preserve unknown exposure instead of inventing zero views',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-exposure-blank-'));
 try{
  fs.writeFileSync(path.join(dir,'posts.jsonl'),JSON.stringify({
   jstDate:'2026-11-06',slot:'12:30',id:'100',meta:{role:'revenue'}
  })+'\n');
  const report=summarizeLocalAffiliateExposure(dir,'2026-11-06');
  assert.equal(report.affiliatePosts,1);
  assert.equal(report.affiliatePostsMissingViews,1);
  assert.equal(report.affiliatePostLifetimeViewsObserved,'unknown');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
