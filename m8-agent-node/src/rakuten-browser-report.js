// Authorized Rakuten Affiliate report browser adapter.
// Defaults to inspection. Report export requires explicit --download.
// Uses isolated browser profile; does not read Threads browser, cookies, or .env secrets.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {parseRakutenDailyCsv} from './rakuten-csv.js';
import {importRakutenReportFiles} from './rakuten-report-importer.js';
import {inspectBrowserMemory,classifyChromeLaunchError} from './rakuten-browser-memory.js';

const REPORT_URL='https://affiliate.rakuten.co.jp/report/';
const DOWNLOAD_TIMEOUT_MS=20000;
const BROWSER_WAIT_MS=18000;
function assert(test,code){if(!test)throw Error(code);}
function executable(){
 const candidates=['C:/Program Files/Google/Chrome/Application/chrome.exe',
 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
 return candidates.find(fs.existsSync);
}
export function classifyRakutenReportPage(url) {
 let u;try{u=new URL(url);}catch{return 'untrusted_origin';}
 if(u.protocol!=='https:')return 'untrusted_origin';
 if(u.hostname==='affiliate.rakuten.co.jp'&&u.pathname.startsWith('/report'))return 'report';
 if(u.hostname==='affiliate.rakuten.co.jp'||u.hostname==='login.account.rakuten.com'||
    u.hostname==='grp01.id.rakuten.co.jp'||u.hostname==='www.rakuten.co.jp')
   return 'authentication_or_navigation';
 return 'untrusted_origin';
}
// Rakuten may redirect or hydrate while Playwright is reading the DOM.
// Retry read-only inspections only; never repeat clicks or downloads.
export function isTransientNavigationError(error){
 const message=String(error?.message||'');
 return /Execution context was destroyed|Cannot find context with specified id|Frame was detached|navigation|Target page, context or browser has been closed/i.test(message)
  && !/Timeout/i.test(message);
}
async function readWhenSettled(page, operation, attempts=8){
 let last;
 for(let i=0;i<attempts;i++){
  try{return await operation();}
  catch(e){
   if(!isTransientNavigationError(e))throw e;
   last=e;
   if(page.isClosed())throw e;
   await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});
   await page.waitForTimeout(450);
  }
 }
 throw last;
}
function sanitizeControls(controls){
 return controls.filter(x=>typeof x?.text==='string'&&x.text.trim())
 .map(x=>({tag:String(x.tag||'').slice(0,12),
   text:x.text.replace(/\s+/g,' ').trim().slice(0,75)})).slice(0,45);
}
async function readControls(page){
 return readWhenSettled(page,()=>page.locator('button,a,[role="button"]').evaluateAll(elements=>
  elements.filter(e=>e.getClientRects().length>0).slice(0,120).map(e=>({
   tag:e.tagName.toLowerCase(),
   text:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim()
  }))
 ).then(sanitizeControls));
}
// Only use the uniquely identified period-by-day report tab. Never select
// order-detail or confirmed-reward tabs by guessing at similar labels.
export function isPeriodTabLabel(text) {
 return String(text || '').trim() === '期間別';
}
// Rakuten's report tabs are rendered as native buttons. Their accessible
// names are not always equal to their visible text, so inspect the actual
// rendered button text, never a broad role/name query that may return zero.
export function selectPeriodButtonIndices(buttons){
 return buttons.map((b,i)=>isPeriodTabLabel(b.text)?i:-1).filter(i=>i>=0);
}
async function periodTabCandidates(page){
 return readWhenSettled(page,()=>page.locator('button').evaluateAll(buttons=>buttons.map((b,index)=>({
  index, visible:Boolean(b.getClientRects().length),
  text:(b.innerText||b.textContent||'').replace(/\s+/g,' ').trim(),
  disabled:b.disabled
 })).filter(b=>b.visible&&b.text)));
}
async function selectPeriodReport(page){
 let controls=[];
 // A hydrated page may mount buttons after domcontentloaded; check up to 5s.
 for(let attempt=0;attempt<10;attempt++){
  controls=await periodTabCandidates(page);
  if(selectPeriodButtonIndices(controls).length===1)break;
  await page.waitForTimeout(500);
 }
 const indices=selectPeriodButtonIndices(controls);
 if(indices.length!==1)return {
  selected:false,status:indices.length?'period_tab_ambiguous':'period_tab_not_found',
  diagnostic:{periodMatches:indices.length,
   visibleButtons:controls.map(b=>b.text.slice(0,55)).slice(0,25)}
 };
 const selected=controls[indices[0]];
 if(selected.disabled)return {selected:false,status:'period_tab_disabled'};
 // Use the DOM-index of the inspected native button, not a name-based locator.
 await page.locator('button').nth(selected.index).click({timeout:BROWSER_WAIT_MS});
 await page.waitForTimeout(1800);
 if(classifyRakutenReportPage(page.url())!=='report')
  return {selected:false,status:'report_navigation_changed'};
 return {selected:true,status:'period_tab_selected'};
}
// Distinguish the day-level export from the month-level report. Refuse
// ambiguous controls and never try an order-detail or confirmed-reward tab.
export function exactButtonIndices(buttons,label){
 return buttons.map((b,i)=>b.text===label&&!b.disabled?i:-1).filter(i=>i>=0);
}
async function clickUniqueNativeButton(page,label){
 const buttons=await periodTabCandidates(page);
 const matches=exactButtonIndices(buttons,label);
 if(matches.length!==1)return {clicked:false,status:'button_not_unique',
  label,count:matches.length};
 const button=buttons[matches[0]];
 await page.locator('button').nth(button.index).click({timeout:BROWSER_WAIT_MS});
 return {clicked:true,label};
}
// This exact CSV anchor was observed after clicking the Rakuten 日別
// report's ダウンロード menu. Other menu links are never selected.
export function exactCsvLinkIndices(links){
 return links.map((link,i)=>(link.visible&&link.text==='CSV')?i:-1).filter(i=>i>=0);
}
async function csvMenuLinkCandidates(page){
 return readWhenSettled(page,()=>page.locator('a').evaluateAll(links=>links.map((a,index)=>({
  index,visible:Boolean(a.getClientRects().length),
  text:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim(),
  href:a.getAttribute('href')||''
 }))));
}
export function isSafeRakutenExportLink(href){
 if(!href||href==='#'||href.startsWith('#'))return true;
 try{
  const u=new URL(href,REPORT_URL);
  return u.protocol==='https:'&&u.hostname==='affiliate.rakuten.co.jp';
 }catch{return false;}
}
async function inspectPeriodFields(page){
 return readWhenSettled(page,()=>page.locator('select,input,[role="combobox"]').evaluateAll(elements=>
  elements.filter(e=>e.getClientRects().length>0).slice(0,35).map(e=>({
   tag:e.tagName.toLowerCase(),type:(e.getAttribute('type')||'').slice(0,20),
   label:(e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.getAttribute('placeholder')||'')
    .replace(/\s+/g,' ').trim().slice(0,65),
   options:e.tagName.toLowerCase()==='select'
    ?Array.from(e.options).slice(0,12).map(o=>o.textContent.trim().slice(0,35)):undefined
  }))
 ));
}
function assertCsv(bytes){
 assert(bytes.length>0&&bytes.length<=5*1024*1024,'invalid_csv_size');
 let text;
 if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)text=bytes.toString('utf8');
 else try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
 const rows=parseRakutenDailyCsv(text);
 assert(rows.length>0,'no_daily_rows');
 return {days:rows.length};
}
export function captureValidatedCsv(downloadDir,bytes,{filename='rakuten-report.csv'}={}){
 const evidence=assertCsv(bytes);
 fs.mkdirSync(downloadDir,{recursive:true});
 // Fixed output name with timestamp; ignore untrusted original download filename.
 const name='rakuten-period-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid+'.csv';
 const destination=path.join(downloadDir,name);
 fs.writeFileSync(destination,bytes,{flag:'wx'});
 return {filename:path.basename(destination),sourceFilename:String(filename).slice(0,90),
  days:evidence.days};
}
// Report safe, actionable diagnostics without exposing page contents, tokens or paths.
export function diagnoseRakutenCaptureFailure(error, stage='unknown'){
 const msg=String(error?.message||'');
 let code='unclassified';
 if(/locator.*(strict mode violation|resolved to .* elements)/i.test(msg))code='ambiguous_locator';
 else if(/Timeout|exceeded|timed out/i.test(msg))code='timeout';
 else if(/Execution context was destroyed|Frame was detached|navigation/i.test(msg))code='page_navigation_race';
 else if(/Target page, context or browser has been closed/i.test(msg))code='browser_closed';
 else if(/invalid_csv|date_column_missing|no_data_rows|no_supported_metrics|invalid_date_row|csv_column_count_mismatch|duplicate_day_in_csv|no_valid_daily_rows|invalid_clicks|invalid_orders|invalid_rewardYen/i.test(msg))
  code='downloaded_csv_format_not_supported';
 else if(/download_is_not_csv/i.test(msg))code='download_file_not_csv';
 else if(/EACCES|EPERM|ENOENT|EEXIST/i.test(msg))code='local_file_access';
 else if(/VirtualAlloc failed|new_pages != nullptr|low_level_alloc/i.test(msg))code='chrome_virtual_memory_exhausted';
 return {stage,code};
}
async function inspectOrCapture({mode='inspect',dataDir=path.resolve(process.env.CFE_DATA_DIR||'.data'),
  downloadDir=process.env.RAKUTEN_REPORT_DOWNLOAD_DIR||path.resolve(process.cwd(),'.data/rakuten-browser-exports'),
  interactive=false}={}){
 assert(mode==='inspect'||mode==='download','unknown_mode');
 const memory=inspectBrowserMemory();
 if(!memory.allowed)return {mode,status:'browser_preflight_blocked',
  memory,noDownload:true,noPosting:true,
  message:'楽天レポート用Chromeを起動しません。Windowsの仮想メモリ設定を確認してください。'};
 const chrome=executable();assert(chrome,'chrome_not_found');
 const profile=path.resolve(dataDir,'rakuten-report-chrome-profile');
 let stage='launch_browser';
 let exportClicked=false;
 try {
 const context=await chromium.launchPersistentContext(profile,{
  executablePath:chrome,headless:!interactive,acceptDownloads:true,
  viewport:{width:1440,height:960},args:['--disable-blink-features=AutomationControlled']
 });
 try {
  stage='navigate_report';
  const page=context.pages()[0]||await context.newPage();
  // Fixed official URL; no unverified third-party navigation.
  await page.goto(REPORT_URL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(2500);
  let classification=classifyRakutenReportPage(page.url());
  if(classification!=='report'&&interactive){
   // Browser remains visible for manual authentication; never attempts CAPTCHA/2FA or credentials.
   console.log(JSON.stringify({status:'manual_rakuten_login_required',
    message:'楽天のブラウザで本人ログインを完了してください。認証情報をこのチャットに送らないでください。'}));
   await page.waitForURL(url=>classifyRakutenReportPage(url.toString())==='report',
     {timeout:120000}).catch(()=>{});
   classification=classifyRakutenReportPage(page.url());
  }
  if(classification!=='report')
   return {mode,status:'login_or_unexpected_page',pageType:classification,
    noDownload:true,noPosting:true};
  stage='select_period_tab';
  const tabResult=await selectPeriodReport(page);
  if(!tabResult.selected)
   return {mode,status:tabResult.status,pageType:'report',diagnostic:tabResult.diagnostic||null,controls:await readControls(page),
    noDownload:true,noPosting:true};
  stage='inspect_report_controls';
  const controls=await readControls(page);
  if(mode==='inspect')
   return {mode,status:'period_report_accessible',pageType:'report',tab:'期間別',
    controls,fields:await inspectPeriodFields(page),
    noDownload:true,noPosting:true,
    message:'期間別画面の操作部品を確認しました。CSVが1件だけ特定できたときのみ別コマンドで取得できます。'};
  // Confirmed live UI: 期間別 -> 日別 -> ダウンロード -> CSV (link).
  // At most one click per control. No retries of download actions.
  stage='select_daily_report';
  const daily=await clickUniqueNativeButton(page,'日別');
  if(!daily.clicked)return {mode,status:'daily_tab_unverified',
    diagnostic:daily,noDownload:true,noPosting:true};
  await page.waitForTimeout(800);
  if(classifyRakutenReportPage(page.url())!=='report')
   return {mode,status:'report_navigation_changed',noDownload:true,noPosting:true};
  stage='locate_download_menu';
  const downloadButtons=await periodTabCandidates(page);
  const matches=exactButtonIndices(downloadButtons,'ダウンロード');
  if(matches.length!==1)return {mode,status:'download_control_unverified',
    count:matches.length,controls:await readControls(page),noDownload:true,noPosting:true};
  const selected=downloadButtons[matches[0]];
  stage='open_download_menu';
  await page.locator('button').nth(selected.index).click({timeout:BROWSER_WAIT_MS});
  // Menu links may be mounted after the click; inspect only until one CSV link
  // appears, then click it exactly once.
  stage='locate_csv_link';
  let links=[],csv=[];
  for(let attempt=0;attempt<8;attempt++){
   links=await csvMenuLinkCandidates(page);
   csv=exactCsvLinkIndices(links);
   if(csv.length)break;
   await page.waitForTimeout(250);
  }
  if(csv.length!==1)return {mode,status:'csv_menu_link_unverified',
   matches:csv.length,controls:await readControls(page),noDownload:true,noPosting:true};
  const link=links[csv[0]];
  if(!isSafeRakutenExportLink(link.href))
   return {mode,status:'untrusted_csv_export_destination',noDownload:true,noPosting:true};
  stage='click_csv_link';
  const downloadPromise=page.waitForEvent('download',{timeout:DOWNLOAD_TIMEOUT_MS}).catch(()=>null);
  exportClicked=true;
  await page.locator('a').nth(link.index).click({timeout:BROWSER_WAIT_MS});
  const download=await downloadPromise;
  if(!download)return {mode,status:'csv_export_no_file',noDownload:true,noPosting:true,
   message:'CSVリンクを一度クリックしましたが、ファイルが届きませんでした。自動再試行しません。'};
  stage='check_download_file';
  const suggested=download.suggestedFilename();
  assert(/\.csv$/i.test(suggested),'download_is_not_csv');
  const temp=path.resolve(dataDir,'rakuten-download-temp');
  fs.mkdirSync(temp,{recursive:true});
  const saved=path.join(temp,'capture-'+Date.now()+'-'+process.pid+'.csv');
  try{
   stage='save_download_file';
   await download.saveAs(saved);
   stage='validate_downloaded_csv';
   const result=captureValidatedCsv(downloadDir,fs.readFileSync(saved),{filename:suggested});
   // Explicit download was requested; import only this validated CSV now.
   // Keep the original saved CSV for inspection/re-import if actual headers differ.
   stage='import_validated_csv';
   const imported=importRakutenReportFiles(dataDir,[path.join(downloadDir,result.filename)]);
   if(imported.failures.length)
    return {mode,status:'csv_saved_import_failed',...result,
     importErrors:imported.failures.map(x=>x.error),noPosting:true};
   return {mode,status:'validated_csv_captured_and_imported',...result,
    imported:imported.imported,noPosting:true};
  }finally{fs.rmSync(saved,{force:true});}
 }finally{await context.close();}
 }catch(error){
  const diagnostic=diagnoseRakutenCaptureFailure(error,stage);
  return {mode,status:'capture_failed',diagnostic,
   exportClicked,noPosting:true,
   noDownload:!exportClicked,
   message:'楽天レポートの処理が停止しました。診断コードを確認してください。'};
 }
}
export {inspectOrCapture};
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
 const mode=process.argv.includes('--download')?'download':'inspect';
 const interactive=process.argv.includes('--interactive');
 inspectOrCapture({mode,interactive})
  .then(result=>{console.log(JSON.stringify(result,null,2));
    if(result.status!=='period_report_accessible'&&result.status!=='validated_csv_captured_and_imported')
      process.exitCode=2;})
  .catch(e=>{
   const reason=classifyChromeLaunchError(e);
   // Chrome error logs can include local profile paths and verbose launch flags.
   console.error(JSON.stringify({status:'capture_failed',reason,
    message:reason==='chrome_virtual_memory_exhausted'
     ? 'Windowsの仮想メモリ不足でChromeが終了しました。ページファイル設定を確認してください。'
     : '楽天レポートブラウザ処理に失敗しました。',noPosting:true,noDownload:true}));
   process.exitCode=1;
  });
}
