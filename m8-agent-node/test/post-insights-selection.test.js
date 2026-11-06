import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPostsForInsights} from '../src/post-insights-selection.js';

const make=(id,day,role='revenue')=>({id,jstDate:day,slot:'12:30',at:day+'T12:30:00+09:00',meta:{role}});
test('refreshes current posts and recent affiliate posts, not old discovery posts',()=>{
 const posts=[
  make('100','2026-11-06','discovery'),make('101','2026-11-06','revenue'),
  make('102','2026-11-05','revenue'),make('103','2026-11-04','discovery'),
  make('104','2026-10-31','revenue'),make('105','2026-10-30','revenue')
 ];
 const result=selectPostsForInsights(posts,'2026-11-06');
 assert.deepEqual(result.map(x=>x.id),['101','102','104','100']);
});
test('deduplicates publication records, caps API requests, excludes unverified IDs',()=>{
 const posts=[];
 for(let i=0;i<20;i++)posts.push(make(String(100+i),'2026-11-05'));
 posts.push(make('abc','2026-11-06'),make('100','2026-11-05'));
 const result=selectPostsForInsights(posts,'2026-11-06');
 assert.equal(result.length,8);
 assert.equal(new Set(result.map(x=>x.id)).size,result.length);
 assert.ok(result.every(x=>/^\d+$/.test(x.id)));
});
test('rejects invalid date',()=>{
 assert.throws(()=>selectPostsForInsights([],'yesterday'),/invalid_report_day/);
});

test('revenue posts remain sampled across seven days when daily editorial posts fill the API cap',()=>{
 const posts=[];
 for(let offset=0;offset<7;offset++){
  const day=new Date(Date.parse('2026-11-07T00:00:00+09:00')
    -offset*86400000+9*3600000).toISOString().slice(0,10);
  posts.push(make(String(1000+offset),day,'revenue'));
  if(offset===0){
   posts.push(make('2001',day,'discovery'));
   posts.push(make('2002',day,'comparison'));
  }
 }
 const chosen=selectPostsForInsights(posts,'2026-11-07',{maxPosts:8});
 assert.equal(chosen.length,8);
 assert.equal(chosen.filter(p=>p.meta.role==='revenue').length,7);
 assert.ok(chosen.some(p=>p.jstDate==='2026-11-01'&&p.meta.role==='revenue'));
 assert.equal(chosen.filter(p=>p.meta.role!=='revenue').length,1);
});
