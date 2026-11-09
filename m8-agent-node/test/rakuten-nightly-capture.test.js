import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runRakutenNightlyCapture,rakutenAutoCaptureDay} from '../src/rakuten-nightly-capture.js';

test('once daily headless capture uses no posting and never repeats export',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-night-'));
 try{
  const calls=[];
  const capture=async arg=>{calls.push(arg);return {status:'validated_csv_captured_and_imported'};};
  const now=new Date('2026-11-06T14:45:00.000Z').getTime();
  assert.equal(rakutenAutoCaptureDay(now),'2026-11-06');
  const first=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(first.status,'validated_csv_captured_and_imported');
  assert.equal(first.noPosting,true);
  assert.deepEqual(calls,[{mode:'download',interactive:false,dataDir:path.resolve(dir)}]);
  const again=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(again.status,'already_attempted_today');
  assert.equal(calls.length,1);
  const next=await runRakutenNightlyCapture(dir,{now:now+24*3600000,capture});
  assert.equal(next.imported,true);
  assert.equal(calls.length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('failed attempt is not retried and disabled capture never opens Chrome',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-night-fail-'));
 try{
  let calls=0;
  const capture=async()=>{calls++;throw Error('unsafe private details');};
  const now=Date.parse('2026-11-06T12:00:00Z');
  const off=await runRakutenNightlyCapture(dir,{now,enabled:false,capture});
  assert.equal(off.status,'disabled');
  const first=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(first.status,'capture_exception');
  assert.equal(first.noPosting,true);
  assert.equal(calls,1);
  const next=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(next.status,'already_attempted_today');
  assert.equal(calls,1);
  const state=fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8');
  assert.ok(!state.includes('unsafe private'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('daily capture records bounded page-versus-export evidence without private metrics',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-date-evidence-'));
 try{
  const now=Date.parse('2026-11-06T13:40:00Z');
  const capture=async()=>({
   status:'downloaded_csv_needs_valid_dates',
   visibleDays:{visibleDateRowCount:6,hasDatedRows:true},
   imported:[],rawText:'SECRET REWARD',schema:{firstRowLabels:['SECRET']}
  });
  const result=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(result.status,'downloaded_csv_needs_valid_dates');
  assert.equal(result.hasDatedRows,true);
  assert.equal(result.visibleDateRowCount,6);
  assert.equal(result.exportDateValidation,'invalid_date_values');
  const state=JSON.parse(fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8'));
  assert.equal(state.lastVisibleDayRowCount,6);
  assert.equal(state.lastHasDatedRows,true);
  assert.equal(state.lastExportDateValidation,'invalid_date_values');
  assert.ok(!JSON.stringify(state).includes('SECRET'));
  assert.equal(result.noPosting,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unbounded or unavailable page evidence remains unknown',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-date-unknown-'));
 try{
  const now=Date.parse('2026-11-06T13:40:00Z');
  const capture=async()=>({status:'downloaded_csv_needs_mapping',
    visibleDays:{visibleDateRowCount:999999,hasDatedRows:true}});
  const x=await runRakutenNightlyCapture(dir,{now,capture});
  assert.equal(x.visibleDateRowCount,'unknown');
  assert.equal(x.hasDatedRows,'unknown');
  assert.equal(x.exportDateValidation,'unknown');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('known invalid-date CSV switches to UI and never automatically repeats CSV',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-invalid-ui-'));
 try{
  const day1=Date.parse('2026-11-06T15:00:00Z');
  const calls=[];
  const capture=async arg=>{calls.push(arg.mode);return {status:arg.mode==='download'?
   'downloaded_csv_needs_valid_dates':'ui_daily_fallback_imported'};};
  assert.equal((await runRakutenNightlyCapture(dir,{now:day1,capture})).status,'downloaded_csv_needs_valid_dates');
  for(const offset of [1,2,3,4]){
   const v=await runRakutenNightlyCapture(dir,{now:day1+offset*86400000,capture});
   assert.equal(v.status,'ui_daily_fallback_imported');
   assert.equal(v.noDownload,true);
   assert.equal(v.noPosting,true);
  }
  assert.deepEqual(calls,['download','ui_daily','ui_daily','ui_daily','ui_daily']);
  const state=JSON.parse(fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8'));
  assert.equal(state.preferredCaptureMode,'ui_daily');
  assert.equal(state.lastCsvAttemptDay,'2026-11-07');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('prior recorded UI success continues using UI even after restart and previous CSV attempts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-rakuten-ui-existing-'));
 try{
  fs.writeFileSync(path.join(dir,'rakuten-nightly-capture.json'),JSON.stringify({
   lastAttemptDay:'2026-11-09',lastResult:'ui_daily_fallback_imported',
   lastCsvAttemptDay:'2026-11-09'
  }));
  const calls=[];
  const capture=async args=>{calls.push(args.mode);return {status:'ui_daily_fallback_imported'};};
  for(const offset of [1,2,3,4,5]){
   const result=await runRakutenNightlyCapture(dir,{now:Date.parse('2026-11-09T14:45:00Z')+offset*86400000,capture});
   assert.equal(result.status,'ui_daily_fallback_imported');
   assert.equal(result.noDownload,true);
  }
  assert.deepEqual(calls,Array(5).fill('ui_daily'));
  const state=JSON.parse(fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8'));
  assert.equal(state.lastCsvAttemptDay,'2026-11-09');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('night capture records safe monthly export metadata without original URL or token',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-export-month-'));
 try{
  const capture=async()=>({status:'downloaded_csv_needs_valid_dates',
   exportTarget:{exportEndpoint:'period_monthly_api',reportMonthMatches:true,
     csvFormatSpecified:true,url:'https://affiliate.rakuten.co.jp/?token=SECRET'},
   visibleDays:{visibleDateRowCount:3}});
  const result=await runRakutenNightlyCapture(dir,{
   now:Date.parse('2026-11-09T14:45:00Z'),capture});
  assert.equal(result.exportEndpoint,'period_monthly_api');
  assert.equal(result.exportMonthMatches,true);
  assert.equal(result.exportFormatCsv,true);
  const state=fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8');
  assert.ok(!state.includes('SECRET'));
  assert.ok(!state.includes('token='));
  assert.ok(state.includes('lastExportMonthMatches'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('successful UI fallback is source-labelled, not misreported as valid CSV',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-night-ui-fallback-'));
 try{
  const capture=async()=>({status:'ui_daily_fallback_imported',
   visibleDays:{visibleDateRowCount:6,hasDatedRows:true}});
  const result=await runRakutenNightlyCapture(dir,{
   now:Date.parse('2026-11-09T14:45:00Z'),capture});
  assert.equal(result.status,'ui_daily_fallback_imported');
  assert.equal(result.imported,true);
  assert.equal(result.importSource,'rakuten_ui_period_daily');
  assert.equal(result.exportDateValidation,'unknown');
  const state=JSON.parse(fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8'));
  assert.equal(state.lastResult,'ui_daily_fallback_imported');
  assert.equal(state.lastSuccessDay,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('verified UI continues every night without periodic CSV retries',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-night-ui-cadence-'));
 try{
  const calls=[];
  const capture=async args=>{calls.push(args.mode);return {status:'ui_daily_fallback_imported'};};
  const day1=Date.parse('2026-11-09T14:45:00Z');
  for(let n=0;n<6;n++){
   const x=await runRakutenNightlyCapture(dir,{now:day1+n*86400000,capture});
   assert.equal(x.status,'ui_daily_fallback_imported');
   if(n>=1)assert.equal(x.noDownload,true);
  }
  assert.deepEqual(calls,['download','ui_daily','ui_daily','ui_daily','ui_daily','ui_daily']);
  const state=JSON.parse(fs.readFileSync(path.join(dir,'rakuten-nightly-capture.json'),'utf8'));
  assert.equal(state.lastCsvAttemptDay,'2026-11-09');
  assert.equal(state.preferredCaptureMode,'ui_daily');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
