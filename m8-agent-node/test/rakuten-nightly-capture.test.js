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
