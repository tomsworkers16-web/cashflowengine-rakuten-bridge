import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditRakutenRejectedExports} from '../src/rakuten-export-audit.js';

test('detects identical placeholder exports without revealing contents or file names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-audit-'));
 try{
  const folder=path.join(dir,'rakuten-report-rejected');
  fs.mkdirSync(folder);
  const csv='楽天レポート "日別\n\n発生日,成果報酬,クリック数,売上件数,売上金額\ndate,0,0,0,0\n';
  fs.writeFileSync(path.join(folder,'rejected-100-10.csv'),csv);
  fs.writeFileSync(path.join(folder,'rejected-200-20.csv'),csv);
  const result=auditRakutenRejectedExports(dir);
  assert.equal(result.filesChecked,2);
  assert.equal(result.distinctContentCount,1);
  assert.equal(result.duplicateContentGroups,1);
  assert.equal(result.latestExactlyRepeated,true);
  assert.equal(result.invalidDatePlaceholderCount,2);
  assert.equal(result.latestCategory,'invalid_date_placeholder');
  assert.equal(result.noPosting,true);
  assert.equal(result.noDownload,true);
  assert.equal(result.nextAction,'inspect_rakuten_ui_export_type_before_more_downloads');
  assert.ok(!JSON.stringify(result).includes('date,0'));
  assert.ok(!JSON.stringify(result).includes('rejected-200'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('distinguishes different exports and parseable dates without importing or writing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfe-audit-distinct-'));
 try{
  const folder=path.join(dir,'rakuten-report-rejected');
  fs.mkdirSync(folder);
  const before='発生日,成果報酬,クリック数\ndate,0,0\n';
  const after='発生日,成果報酬,クリック数\n2026/11/05,0,0\n';
  fs.writeFileSync(path.join(folder,'rejected-100-10.csv'),before);
  fs.writeFileSync(path.join(folder,'rejected-200-20.csv'),after);
  const result=auditRakutenRejectedExports(dir);
  assert.equal(result.distinctContentCount,2);
  assert.equal(result.invalidDatePlaceholderCount,1);
  assert.equal(result.validDateReportCount,1);
  assert.equal(result.latestExactlyRepeated,false);
  assert.equal(result.filesChecked,2);
  assert.equal(fs.readdirSync(folder).length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
