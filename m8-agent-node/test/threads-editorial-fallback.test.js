import test from 'node:test';
import assert from 'node:assert/strict';
import {planEditorialFallback,selectDailyStage,DAILY_AUTO_POLICY,summarizeDailyCycleOutcome,planThreadsDailyCycle,selectEveningResearchStage} from '../src/threads-daily-cycle.js';
import {publishTextOnce} from '../src/posting-guard.js';
const jstDate='2026-11-26';
const plan=planEditorialFallback({jstDate});
const input={plan,jstDate,slot:'12:30',officialPostCount:0,autoPolicy:DAILY_AUTO_POLICY,accountUsername:'rakumitsu_select',allowEditorialFallback:true};
test('fallback can publish a later slot without a missed morning; no PR or external replies',()=>{
 assert.equal(plan.status,'editorial_fallback_review_required');
 assert.equal(plan.slots.length,3);assert.deepEqual(plan.replySuggestions,[]);
 for(const s of plan.slots){assert.equal(s.affiliateUrl,null);assert.doesNotMatch(s.text,/https?:|【PR】/);}
 const a=selectDailyStage(input);assert.equal(a.status,'eligible_for_existing_publisher');assert.equal(a.meta.affiliate,false);
});
test('fallback needs distinct opt-in and exact trusted copy, correct account and current date',()=>{
 for(const change of [{allowEditorialFallback:false},{accountUsername:'wrong'},{jstDate:'2026-11-27'},{plan:{...plan,slots:plan.slots.map(s=>({...s,text:s.text+'変更'}))}},{plan:{...plan,replySuggestions:[{}]}}])assert.equal(selectDailyStage({...input,...change}).status,'hold');
});
test('fallback respects caps, duplicate slots and uncertainty',()=>{
 assert.equal(selectDailyStage({...input,officialPostCount:3}).reason,'daily_cap_reached');
 assert.equal(selectDailyStage({...input,journal:[{jstDate,slot:'12:30'}]}).reason,'slot_already_attempted');
 assert.equal(selectDailyStage({...input,journal:[{jstDate,slot:'07:30',meta:{publishStatus:'pending'}}]}).reason,'previous_attempt_uncertain');
});
test('recent copy rotates theme and reporting identifies confirmed fallback stages',()=>{
 const history=plan.slots.map(s=>({...s,jstDate,id:'id-'+s.slot,meta:{publishStatus:'posted',campaignId:plan.campaignId,dailyStage:s.role}}));
 const next=planEditorialFallback({jstDate,history});assert.notEqual(next.theme,plan.theme);
 const outcome=summarizeDailyCycleOutcome({plan,jstDate,journal:history});assert.equal(outcome.confirmed,3);assert.equal(outcome.stages[2].role,'guide');
});
test('fallback publishes all three with actual durable pending/posted journal rows',async()=>{
 const journal=[];let count=0;
 for(const s of plan.slots){const action=selectDailyStage({...input,slot:s.slot,journal,officialPostCount:count});assert.equal(action.status,'eligible_for_existing_publisher');await publishTextOnce({text:action.text,slot:s.slot,jstDate,meta:action.meta,record:r=>journal.push(r),send:async()=>String(++count),lookup:async()=>[]});}
 assert.equal(count,3);assert.equal(journal.length,6);
});
test('evening PR is fresh, same theme, exact, opted-in and follows both verified guides',()=>{
 const item={itemCode:'shop:1',itemName:'収納チェスト ラック',rank:2,price:4999,hasAffiliateUrl:true};
 const page='https://item.rakuten.co.jp/shop/chest/',affiliateUrl='https://hb.afl.rakuten.co.jp/ichiba/example/?pc='+encodeURIComponent(page);
 const product=planThreadsDailyCycle({jstDate,ranking:[item],researchByItemCode:{[item.itemCode]:{itemCode:item.itemCode,productPageUrl:page,affiliateUrl,rights:{noMedia:true},facts:[{id:'dimensions',claim:'引き出しの内幅は26cmと記載',sourceUrl:page,checkedAt:jstDate,evidenceQuote:'引き出し内幅26cm'},{id:'material',claim:'材質はポリプロピレンと記載',sourceUrl:page,checkedAt:jstDate,evidenceQuote:'材質 ポリプロピレン'}]}}});
 let guide=planEditorialFallback({jstDate});const history=[];for(let i=0;i<6&&guide.theme!=='storage';i++){history.push(...guide.slots.map(s=>({...s,jstDate})));guide=planEditorialFallback({jstDate,history});}
 assert.equal(guide.theme,'storage');const journal=guide.slots.slice(0,2).flatMap(s=>[{...s,jstDate,meta:{publishStatus:'pending'}},{...s,jstDate,id:s.slot,meta:{publishStatus:'posted',campaignId:guide.campaignId,dailyStage:s.role}}]);
 const args={...input,plan:guide,slot:'19:30',journal,officialPostCount:2,evening:{fallbackDigest:guide.digest,plan:product}};
 const action=selectEveningResearchStage(args);assert.equal(action.status,'eligible_for_existing_publisher');assert.equal(action.meta.affiliate,true);
 for(const change of [{journal:[]},{allowEditorialFallback:false},{officialPostCount:3},{evening:{...args.evening,fallbackDigest:'wrong'}},{evening:{...args.evening,plan:{...product,slots:product.slots.map(s=>({...s,text:s.text+'edited'}))}}}])assert.equal(selectEveningResearchStage({...args,...change}).status,'hold');
 const result=summarizeDailyCycleOutcome({plan:guide,evening:args.evening,jstDate,journal:[...journal,{jstDate,slot:'19:30',id:'evening',text:action.text,meta:{...action.meta,publishStatus:'posted'}}]});assert.equal(result.confirmed,3);assert.equal(result.stages[2].role,'revenue');
});
