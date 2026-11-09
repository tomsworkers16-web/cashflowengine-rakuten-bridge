// Once-daily headless Rakuten report capture. Runs only in the existing nightly
// evaluation process; no window focus, posting, password entry or retries.
import fs from 'node:fs';
import path from 'node:path';
import {inspectOrCapture} from './rakuten-browser-report.js';

export function rakutenAutoCaptureDay(now=Date.now()){
 return new Date(now+9*3600000).toISOString().slice(0,10);
}
export async function runRakutenNightlyCapture(dataDir, {
 now=Date.now(),enabled=true,capture=inspectOrCapture
}={}){
 const day=rakutenAutoCaptureDay(now);
 if(!enabled)return {status:'disabled',jstDay:day,noPosting:true};
 const root=path.resolve(dataDir);
 fs.mkdirSync(root,{recursive:true});
 const statePath=path.join(root,'rakuten-nightly-capture.json');
 const lockPath=path.join(root,'rakuten-nightly-capture.lock');
 let state={};
 try {if(fs.existsSync(statePath))state=JSON.parse(fs.readFileSync(statePath,'utf8'));}
 catch{return {status:'state_unreadable',jstDay:day,noPosting:true};}
 if(state.lastAttemptDay===day)return {
  status:'already_attempted_today',jstDay:day,lastResult:state.lastResult||'unknown',noPosting:true
 };
 let fd;
 try{fd=fs.openSync(lockPath,'wx');}
 catch{
  // A power outage can leave an orphan lock. Recovery is safe because the
  // persisted day guard still prevents repeat exports for the same day.
  try{
   if(now-fs.statSync(lockPath).mtimeMs>3*3600000){
    fs.rmSync(lockPath,{force:true});
    fd=fs.openSync(lockPath,'wx');
   }
  }catch{}
  if(fd===undefined)return {status:'capture_already_running',jstDay:day,noPosting:true};
 }
 try{
  // Lock and reread after acquiring, avoiding two concurrent nightly tasks.
  if(fs.existsSync(statePath)){
   try{state=JSON.parse(fs.readFileSync(statePath,'utf8'));}
   catch{return {status:'state_unreadable',jstDay:day,noPosting:true};}
  }
  if(state.lastAttemptDay===day)return {
   status:'already_attempted_today',jstDay:day,lastResult:state.lastResult||'unknown',noPosting:true
  };
  // Commit the attempt BEFORE entering Chrome. Never retry a clicked export
  // just because a scheduled task or Windows process was interrupted.
  const write=(value)=>{
   const tmp=statePath+'.tmp-'+process.pid;
   try{
    fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    fs.renameSync(tmp,statePath);
   }finally{fs.rmSync(tmp,{force:true});}
  };
  // Once a verified UI fallback succeeds OR the CSV date is known invalid,
  // stop scheduling repeated CSV downloads. Use the daily UI instead.
  // Existing validated CSV users remain on the current path unless a later
  // invalid-date result switches them to UI.
  const uiOnly=['ui_daily_fallback_imported','downloaded_csv_needs_valid_dates',
    'ui_daily_unverified'].includes(state.lastResult)
    || state.preferredCaptureMode==='ui_daily';
  write({...state,lastAttemptDay:day,lastResult:'in_progress'});
  let result;
  try{result=await capture({mode:uiOnly?'ui_daily':'download',
    interactive:false,dataDir:root});}
  catch{result={status:'capture_exception'};}

  const status=String(result?.status||'capture_exception');
  // No personal report values or page contents are exposed in state/summary.
  const allowed=new Set(['validated_csv_captured_and_imported','ui_daily_fallback_imported',
   'ui_daily_unverified','downloaded_csv_needs_mapping','downloaded_csv_needs_valid_dates',
   'browser_preflight_blocked','login_or_unexpected_page','capture_failed',
   'csv_export_no_file','csv_saved_import_failed','csv_menu_link_unverified',
   'download_control_unverified','daily_tab_unverified','untrusted_csv_export_destination',
   'report_navigation_changed','period_tab_not_found','period_tab_ambiguous']);
  const sanitized=allowed.has(status)?status:'capture_exception';
  // Preserve only bounded structural evidence for local diagnosis. No raw
  // CSV cells, report values, URLs, account IDs or browser contents.
  const visibleDateRowCount=Number.isInteger(result?.visibleDays?.visibleDateRowCount)
    && result.visibleDays.visibleDateRowCount>=0
    && result.visibleDays.visibleDateRowCount<=120
    ? result.visibleDays.visibleDateRowCount : 'unknown';
  const hasDatedRows=visibleDateRowCount==='unknown'?'unknown':visibleDateRowCount>0;
  const exportDateValidation=sanitized==='downloaded_csv_needs_valid_dates'
    ?'invalid_date_values'
    :sanitized==='validated_csv_captured_and_imported'?'valid':'unknown';
  const exportEndpoint=['period_monthly_api','period_daily_api','other_official_path','untrusted']
    .includes(result?.exportTarget?.exportEndpoint)
     ?result.exportTarget.exportEndpoint:'unknown';
  const exportMonthMatches=result?.exportTarget?.reportMonthMatches===true
    ?true:result?.exportTarget?.reportMonthMatches===false?false:'unknown';
  const exportFormatCsv=result?.exportTarget?.csvFormatSpecified===true;
  write({...state,lastAttemptDay:day,lastResult:sanitized,
   preferredCaptureMode:uiOnly||sanitized==='ui_daily_fallback_imported'||sanitized==='downloaded_csv_needs_valid_dates'?'ui_daily':state.preferredCaptureMode,
   lastCsvAttemptDay:uiOnly?state.lastCsvAttemptDay:day,
   lastVisibleDayRowCount:visibleDateRowCount,lastHasDatedRows:hasDatedRows,
   lastExportDateValidation:exportDateValidation,
   lastExportEndpoint:exportEndpoint,
   lastExportMonthMatches:exportMonthMatches,
   lastExportFormatCsv:exportFormatCsv,
   ...(sanitized==='validated_csv_captured_and_imported'?{lastSuccessDay:day}:{})});
  return {status:sanitized,jstDay:day,noPosting:true,noDownload:uiOnly,interactive:false,
   visibleDateRowCount,hasDatedRows,exportDateValidation,
   exportEndpoint,exportMonthMatches,exportFormatCsv,
   imported:['validated_csv_captured_and_imported','ui_daily_fallback_imported'].includes(sanitized),
   importSource:sanitized==='ui_daily_fallback_imported'?'rakuten_ui_period_daily'
     :sanitized==='validated_csv_captured_and_imported'?'rakuten_csv_period_daily':'unknown'};
 }finally{
  try{fs.closeSync(fd);}catch{}
  fs.rmSync(lockPath,{force:true});
 }
}
