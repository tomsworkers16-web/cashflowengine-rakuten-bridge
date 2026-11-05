// Authorized Rakuten Affiliate report browser adapter.
// Defaults to inspection. Report export requires explicit --download.
// Uses isolated browser profile; does not read Threads browser, cookies, or .env secrets.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {parseRakutenDailyCsv} from './rakuten-csv.js';
import {intakeRakutenDownloads} from './rakuten-download-intake.js';
import {scanRakutenInbox} from './rakuten-report-importer.js';

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
function sanitizeControls(controls){
 return controls.filter(x=>typeof x?.text==='string'&&x.text.trim())
 .map(x=>({tag:String(x.tag||'').slice(0,12),
   text:x.text.replace(/\s+/g,' ').trim().slice(0,75)})).slice(0,45);
}
async function readControls(page){
 return page.locator('button,a,[role="button"]').evaluateAll(elements=>
  elements.filter(e=>e.getClientRects().length>0).slice(0,120).map(e=>({
   tag:e.tagName.toLowerCase(),
   text:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim()
  }))
 ).then(sanitizeControls);
}
// Only use the uniquely identified period-by-day report tab. Never select
// order-detail or confirmed-reward tabs by guessing at similar labels.
export function isPeriodTabLabel(text) {
 return String(text || '').trim() === '期間別';
}
async function selectPeriodReport(page){
 const tab=page.getByRole('button',{name:'期間別',exact:true});
 if(await tab.count()!==1)return {selected:false,status:'period_tab_not_unique'};
 await tab.click({timeout:BROWSER_WAIT_MS});
 await page.waitForTimeout(1800);
 if(classifyRakutenReportPage(page.url())!=='report')
  return {selected:false,status:'report_navigation_changed'};
 return {selected:true,status:'period_tab_selected'};
}
async function inspectPeriodFields(page){
 return page.locator('select,input,[role="combobox"]').evaluateAll(elements=>
  elements.filter(e=>e.getClientRects().length>0).slice(0,35).map(e=>({
   tag:e.tagName.toLowerCase(),type:(e.getAttribute('type')||'').slice(0,20),
   label:(e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.getAttribute('placeholder')||'')
    .replace(/\s+/g,' ').trim().slice(0,65),
   options:e.tagName.toLowerCase()==='select'
    ?Array.from(e.options).slice(0,12).map(o=>o.textContent.trim().slice(0,35)):undefined
  }))
 );
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
async function inspectOrCapture({mode='inspect',dataDir=path.resolve(process.env.CFE_DATA_DIR||'.data'),
  downloadDir=process.env.RAKUTEN_REPORT_DOWNLOAD_DIR||path.resolve(process.cwd(),'.data/rakuten-browser-exports'),
  interactive=false}={}){
 assert(mode==='inspect'||mode==='download','unknown_mode');
 const chrome=executable();assert(chrome,'chrome_not_found');
 const profile=path.resolve(dataDir,'rakuten-report-chrome-profile');
 const context=await chromium.launchPersistentContext(profile,{
  executablePath:chrome,headless:!interactive,acceptDownloads:true,
  viewport:{width:1440,height:960},args:['--disable-blink-features=AutomationControlled']
 });
 try {
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
  const tabResult=await selectPeriodReport(page);
  if(!tabResult.selected)
   return {mode,status:tabResult.status,pageType:'report',controls:await readControls(page),
    noDownload:true,noPosting:true};
  const controls=await readControls(page);
  if(mode==='inspect')
   return {mode,status:'period_report_accessible',pageType:'report',tab:'期間別',
    controls,fields:await inspectPeriodFields(page),
    noDownload:true,noPosting:true,
    message:'期間別画面の操作部品を確認しました。CSVが1件だけ特定できたときのみ別コマンドで取得できます。'};
  // Very restrictive automatic capture: visible single CSV-labeled button/link only.
  // If ambiguous or absent, do not click unknown links or icons.
  const candidates=page.getByRole('button',{name:/CSV|ダウンロード/i});
  const linkCandidates=page.getByRole('link',{name:/CSV.*ダウンロード|ダウンロード.*CSV/i});
  const count=(await candidates.count())+(await linkCandidates.count());
  if(count!==1)return {mode,status:'csv_control_unverified',count,
    controls,noDownload:true,noPosting:true};
  const control=(await candidates.count())===1?candidates.first():linkCandidates.first();
  const label=String(await control.getAttribute('aria-label')||
    await control.innerText().catch(()=>'' )).slice(0,100);
  // CSV must be explicitly visible in the control label to prevent clicking unrelated exports.
  if(!/csv/i.test(label))return {mode,status:'csv_label_not_verified',
    noDownload:true,noPosting:true};
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:DOWNLOAD_TIMEOUT_MS}),
    control.click({timeout:BROWSER_WAIT_MS})
  ]);
  const suggested=download.suggestedFilename();
  assert(/\.csv$/i.test(suggested),'download_is_not_csv');
  const temp=path.resolve(dataDir,'rakuten-download-temp');
  fs.mkdirSync(temp,{recursive:true});
  const saved=path.join(temp,'capture-'+Date.now()+'-'+process.pid+'.csv');
  try{
   await download.saveAs(saved);
   const result=captureValidatedCsv(downloadDir,fs.readFileSync(saved),{filename:suggested});
   // Never import blindly into results when the watched folder is not configured.
   const autoImport=process.env.RAKUTEN_REPORT_DOWNLOAD_DIR
    ? {capture:intakeRakutenDownloads(dataDir,downloadDir),import:scanRakutenInbox(dataDir)}
    : {status:'download_saved_import_not_configured'};
   return {mode,status:'validated_csv_captured',...result,autoImport,noPosting:true};
  }finally{fs.rmSync(saved,{force:true});}
 }finally{await context.close();}
}
export {inspectOrCapture};
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
 const mode=process.argv.includes('--download')?'download':'inspect';
 const interactive=process.argv.includes('--interactive');
 inspectOrCapture({mode,interactive})
  .then(result=>{console.log(JSON.stringify(result,null,2));
    if(result.status!=='period_report_accessible'&&result.status!=='validated_csv_captured')
      process.exitCode=2;})
  .catch(e=>{console.error(JSON.stringify({status:'capture_failed',error:e.message,noPosting:true}));process.exitCode=1;});
}
