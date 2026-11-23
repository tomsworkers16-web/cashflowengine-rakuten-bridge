import test from 'node:test';
import assert from 'node:assert/strict';
import {planThreadsDailyCycle,selectDailyStage,planDailyReplySuggestions,selectApprovedDailyReplies,summarizeDailyCycleOutcome} from '../src/threads-daily-cycle.js';
import {publishTextOnce} from '../src/posting-guard.js';
const day='2026-11-24';
const item={itemCode:'shop:1',itemName:'収納チェスト ラック',rank:2,price:4999,hasAffiliateUrl:true};
const page='https://item.rakuten.co.jp/shop/chest/';
const link='https://hb.afl.rakuten.co.jp/ichiba/example/?pc='+encodeURIComponent(page);
const research={itemCode:item.itemCode,productPageUrl:page,affiliateUrl:link,rights:{noMedia:true},facts:[{id:'dimensions',claim:'引き出しの内幅は26cmと記載',sourceUrl:page,checkedAt:day}]};
const input={jstDate:day,ranking:[item],researchByItemCode:{[item.itemCode]:research}};
const plan=()=>planThreadsDailyCycle(input);
const approval=p=>({approvedByOwner:true,jstDate:day,campaignId:p.campaignId,digest:p.digest});
const slot=(p,which,extra={})=>selectDailyStage({plan:p,approval:approval(p),jstDate:day,slot:which,journal:[],officialPostCount:0,...extra});
const posted=(p,index,status='posted')=>({id:'p'+index,jstDate:day,slot:p.slots[index].slot,text:p.slots[index].text,meta:{campaignId:p.campaignId,dailyStage:p.slots[index].role,publishStatus:status,itemCode:p.itemCode}});

test('one audited product creates 3 coherent slots, PR last, no permission to publish',()=>{
 const p=plan();assert.equal(p.status,'batch_review_required');assert.deepEqual(p.slots.map(x=>x.role),['column','comparison','revenue']);assert.ok(p.slots[2].text.endsWith(link));assert.ok(p.slots[2].text.startsWith('【PR】'));assert.ok(p.slots.slice(0,2).every(x=>!x.text.includes('https://')));assert.ok(p.slots.every(x=>x.text.length<=500));assert.equal(p.publishApproved,false);
});
test('unverified, stale or mismatched product evidence holds all stages',()=>{
 for(const changes of [{itemCode:'other:1'},{affiliateUrl:'https://example.org/a'},{affiliateUrl:link.replace('chest','other')},{facts:[{...research.facts[0],checkedAt:'2026-10-01'}]}]){
  const p=planThreadsDailyCycle({...input,researchByItemCode:{[item.itemCode]:{...research,...changes}}});assert.equal(p.status,'research_required');assert.equal(p.slots.length,0);
 }
});
test('recently featured item is not repeated on the next day',()=>{const p=planThreadsDailyCycle({...input,history:[{jstDate:'2026-11-23',meta:{itemCode:item.itemCode}}]});assert.equal(p.slots.length,0);});
test('identical recently confirmed guide is not repeated with a different item',()=>{
 const p=plan();const history=[{...posted(p,0),jstDate:'2026-11-23',meta:{publishStatus:'posted',itemCode:'other:1'}}];
 const next=planThreadsDailyCycle({...input,history});assert.equal(next.status,'research_required');assert.equal(next.held[0].reason,'recent_editorial_copy');
});
test('missing approval and edits after approval are blocked',()=>{const p=plan();assert.equal(slot(p,'07:30',{approval:null}).reason,'approval_missing_or_changed');p.slots[0].text+='変更';assert.equal(slot(p,'07:30').reason,'approval_missing_or_changed');});
test('no PR before column and comparison are verified',()=>{const p=plan();assert.equal(slot(p,'19:30').reason,'previous_stage_not_verified');assert.equal(slot(p,'19:30',{journal:[posted(p,0),posted(p,1,'uncertain')]}).reason,'previous_stage_not_verified');assert.equal(slot(p,'19:30',{journal:[posted(p,0),posted(p,1)]}).status,'eligible_for_existing_publisher');});
test('another campaign, different text, stale date or previously attempted slot is blocked',()=>{const p=plan();const row=posted(p,0);row.meta.campaignId='different';assert.equal(slot(p,'12:30',{journal:[row]}).reason,'previous_stage_not_verified');assert.equal(slot(p,'07:30',{journal:[posted(p,0,'pending')]}).reason,'slot_already_attempted');assert.equal(slot(p,'07:30',{jstDate:'2026-11-25'}).reason,'missing_or_stale_plan');assert.equal(slot(p,'07:30',{officialPostCount:3}).reason,'daily_cap_reached');});
test('reply suggestions are relevant, unique, link-free and never approved',()=>{
 const row={author:'abc',url:'https://www.threads.com/@abc/post/abc1',text:'収納の片付けに困っているのですが、整理はどうしてる？毎日面倒で悩んでいます。'};
 const candidates=[row,{...row,url:'https://www.threads.com/@abc/post/abc2'},{...row,author:'xyz',url:'https://www.threads.com/@xyz/post/xyz1',text:'楽天の収納は広告でPRしています。'},{...row,author:'other',url:'https://example.org/@other/post/a'}];
 const result=planDailyReplySuggestions({candidates,ownUsername:'rakumitsu_select',theme:'storage',date:day});assert.equal(result.length,1);assert.equal(result[0].publishApproved,false);assert.ok(!result[0].replyDraft.includes('http'));
 assert.equal(planDailyReplySuggestions({candidates,history:[{jstDate:day,status:'unverified',author:'abc',url:row.url}],ownUsername:'rakumitsu_select',theme:'storage',date:day}).length,0);
});
test('mocked existing publisher progresses exactly three verified stages, not a fourth',async()=>{
 const p=plan(),journal=[];let sent=0;
 for(const s of p.slots){const action=slot(p,s.slot,{journal,officialPostCount:sent});assert.equal(action.status,'eligible_for_existing_publisher');await publishTextOnce({text:action.text,slot:s.slot,jstDate:day,meta:action.meta,record:r=>journal.push(r),send:async()=>String(++sent),lookup:async()=>[]});}
 assert.equal(sent,3);assert.equal(slot(p,'19:30',{journal,officialPostCount:sent}).reason,'daily_cap_reached');
});
test('missing affiliate URL space cannot produce a truncated PR',()=>{const p=planThreadsDailyCycle({...input,researchByItemCode:{[item.itemCode]:{...research,affiliateUrl:link+'&long='+'a'.repeat(500)}}});assert.equal(p.status,'research_required');});
test('night evaluation measures only confirmed exact post IDs and never invents affiliate attribution',()=>{
 const p=plan();const r=summarizeDailyCycleOutcome({plan:p,jstDate:day,journal:[posted(p,0),posted(p,1,'uncertain')],insights:[{id:'p0',metrics:{views:12}},{id:'p1',metrics:{views:99}}]});assert.equal(r.confirmed,1);assert.deepEqual(r.stages.map(s=>s.views),[12,'unknown','unknown']);assert.equal(r.affiliateAttribution,'unknown');
});
test('external reply requires explicit selection, unchanged source and verified opening column',()=>{
 const candidate={author:'abc',url:'https://www.threads.com/@abc/post/abc1',text:'収納の片付けに困っているのですが、整理はどうしてる？毎日面倒で悩んでいます。'};
 const p=planThreadsDailyCycle({...input,replyCandidates:[candidate],ownUsername:'rakumitsu_select'});
 const params={plan:p,approval:{...approval(p),approvedReplyUrls:[candidate.url]},jstDate:day,candidates:[candidate],ownUsername:'rakumitsu_select',journal:[posted(p,0)]};
 assert.equal(selectApprovedDailyReplies(params).length,1);
 assert.equal(selectApprovedDailyReplies({...params,journal:[]}).length,0);
 assert.equal(selectApprovedDailyReplies({...params,approval:approval(p)}).length,0);
 assert.equal(selectApprovedDailyReplies({...params,candidates:[{...candidate,text:candidate.text+' 追記'}]}).length,0);
 assert.equal(selectApprovedDailyReplies({...params,replyHistory:[{jstDate:day,url:candidate.url,status:'unverified',author:candidate.author}]}).length,0);
});
