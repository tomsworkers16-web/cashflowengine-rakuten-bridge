import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from './idea-triage-worker.mjs';
import {OWNER_ID} from './idea-intake-core.mjs';
function fixture() {
 const writes=[];
 const issue={number:31,user:{id:OWNER_ID},title:'[IDEA-031] 楽天の記事を改善',body:'記事のクリック率を改善',labels:[]};
 const send=async(path,opts={})=>{
  if(path==='')return {private:true};
  if(path.startsWith('/issues?'))return [issue,{number:32,user:{id:1},title:'[IDEA-032] spoof',body:'fake',labels:[]}];
  if(path==='/issues/31/comments?per_page=100')return [];
  if(path==='/issues/31/comments' && opts.method==='POST'){writes.push(opts.body);return {id:123}};
  throw Error('unexpected_route');
 };
 return {send,writes};
}
test('dry run does not post',async()=>{const x=fixture();const result=await run({send:x.send,write:false});assert.equal(result.mode,'dry-run');assert.equal(x.writes.length,0);assert.equal(result.results[0].priority,'P1')});
test('apply posts a safe structured plan once',async()=>{const x=fixture();const result=await run({send:x.send,write:true});assert.equal(result.processed,1);assert.equal(x.writes.length,1);assert.match(x.writes[0].body,/AstonishFactory:idea-intake:v1/)});
test('duplicate marker prevents repeated posting',async()=>{const x=fixture();const send=async(path,opts)=>path==='/issues/31/comments?per_page=100'?[{body:'<!-- AstonishFactory:idea-intake:v1 -->'}]:x.send(path,opts);const result=await run({send,write:true});assert.equal(result.results[0].status,'already_triaged');assert.equal(x.writes.length,0)});
test('reject public control repo',async()=>{await assert.rejects(run({send:async()=>({private:false})}),/control_repository_not_private/)});
