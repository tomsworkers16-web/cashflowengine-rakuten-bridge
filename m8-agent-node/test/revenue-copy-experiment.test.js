import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRevenueCopyVariants} from '../src/revenue-copy-experiment.js';

const post=(id,variant,role='revenue')=>({id,meta:{role,copyVariant:variant}});
const insight=(id,views)=>({id,metrics:{views}});

test('separates copy hypotheses and refuses conclusions from insufficient data',()=>{
 const report=summarizeRevenueCopyVariants([
  post('a','spec_check'),post('b','compare_before_buy'),post('c',null),
  post('d','compare_before_buy','discovery')
 ],[insight('a',400),insight('b',300),insight('c',20),insight('d',800)]);
 assert.equal(report.automatedWinnerSelection,false);
 assert.equal(report.exploratoryComparisonReady,false);
 assert.equal(report.variants.length,3);
 assert.equal(report.variants.find(v=>v.variant==='compare_before_buy').totalViews,300);
 assert.match(report.caveat,/因果関係/);
});

test('only measured post views count toward an exploratory comparison',()=>{
 const posts=[];
 const insights=[];
 for(let i=0;i<3;i++){
  posts.push(post('a'+i,'spec_check'),post('b'+i,'compare_before_buy'));
  insights.push(insight('a'+i,100),insight('b'+i,150));
 }
 const report=summarizeRevenueCopyVariants(posts,insights);
 assert.equal(report.exploratoryComparisonReady,true);
 assert.equal(report.automatedWinnerSelection,false);
 assert.equal(report.variants.find(v=>v.variant==='compare_before_buy').averageViewsPerMeasuredPost,150);
 const missing=summarizeRevenueCopyVariants(posts,insights.slice(0,3));
 assert.equal(missing.exploratoryComparisonReady,false);
 assert.ok(missing.variants.some(v=>v.missingViews>0));
});
