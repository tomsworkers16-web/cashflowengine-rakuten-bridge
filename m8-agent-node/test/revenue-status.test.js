import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildLocalRevenueStatus} from '../src/revenue-status.js';

test('read-only status preserves unknown earnings when no ledger exists',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-revenue-status-'));
 try{
  const now=Date.parse('2026-11-06T03:00:00Z');
  const before=fs.readdirSync(dir);
  const result=buildLocalRevenueStatus(dir,now);
  assert.equal(result.mode,'read_only_no_post');
  assert.equal(result.sevenDay.daysReported,0);
  assert.equal(result.sevenDay.provisionalOrConfirmedRewardYen,'unknown');
  assert.equal(result.csv.ledgerPresent,false);
  assert.deepEqual(fs.readdirSync(dir),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('read-only status exposes only safe summary and first reported reward',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-revenue-status-'));
 try{
  fs.writeFileSync(path.join(dir,'affiliate-results.json'),JSON.stringify({records:[
   {jstDate:'2026-11-05',source:'rakuten_csv_period_daily',
    recordId:'period:2026-11-05',rewardStatus:'provisional',
    clicks:4,salesCount:1,rewardYen:32,salesAmountYen:1600}
  ]}));
  fs.writeFileSync(path.join(dir,'rakuten-nightly-capture.json'),
   JSON.stringify({lastAttemptDay:'2026-11-05',lastResult:'validated_csv_captured_and_imported'}));
  const value=buildLocalRevenueStatus(dir,Date.parse('2026-11-06T01:00:00Z'));
  assert.equal(value.sevenDay.provisionalOrConfirmedRewardYen,32);
  assert.equal(value.sevenDay.firstReportedCommissionDay,'2026-11-05');
  assert.equal(value.sevenDay.confirmedNetProfitYen,'unknown');
  assert.equal(value.csv.lastCaptureResult,'validated_csv_captured_and_imported');
  assert.match(value.nextAction,/確定状況/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
