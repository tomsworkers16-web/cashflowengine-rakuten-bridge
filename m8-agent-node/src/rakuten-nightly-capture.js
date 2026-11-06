// Once-daily headless Rakuten export. Runs only in the existing nightly
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
  write({...state,lastAttemptDay:day,lastResult:'in_progress'});
  let result;
  try{result=await capture({mode:'download',interactive:false,dataDir:root});}
  catch{result={status:'capture_exception'};}
  const status=String(result?.status||'capture_exception');
  // No personal report values or page contents are exposed in state/summary.
  const allowed=new Set(['validated_csv_captured_and_imported','downloaded_csv_needs_mapping',
   'browser_preflight_blocked','login_or_unexpected_page','capture_failed',
   'csv_export_no_file','csv_saved_import_failed','csv_menu_link_unverified',
   'download_control_unverified','daily_tab_unverified','untrusted_csv_export_destination',
   'report_navigation_changed','period_tab_not_found','period_tab_ambiguous']);
  const sanitized=allowed.has(status)?status:'capture_exception';
  write({...state,lastAttemptDay:day,lastResult:sanitized,
   ...(sanitized==='validated_csv_captured_and_imported'?{lastSuccessDay:day}:{})});
  return {status:sanitized,jstDay:day,noPosting:true,interactive:false,
   imported:sanitized==='validated_csv_captured_and_imported'};
 }finally{
  try{fs.closeSync(fd);}catch{}
  fs.rmSync(lockPath,{force:true});
 }
}
