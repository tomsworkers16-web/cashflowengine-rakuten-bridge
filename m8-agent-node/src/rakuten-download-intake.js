// Optional watch-only intake from a dedicated local Rakuten CSV download folder.
// Explicit opt-in RAKUTEN_REPORT_DOWNLOAD_DIR; never scans the whole Downloads folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseRakutenDailyCsv} from './rakuten-csv.js';

function decode(bytes){
 if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return bytes.toString('utf8');
 try {return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch {return new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
}
export function intakeRakutenDownloads(dataDir, sourceDir){
 const result={enabled:Boolean(sourceDir),scanned:0,accepted:0,alreadyCaptured:0,
  rejected:0,errors:[],sourceStatus:sourceDir?'not_checked':'not_configured'};
 if(!sourceDir)return result;
 const root=path.resolve(sourceDir);
 try{
  if(!fs.statSync(root).isDirectory())throw Error('source_not_directory');
  // Refuse accidental use of the entire OS Downloads folder (privacy/scope).
  if(path.basename(root).toLowerCase()==='downloads')throw Error('dedicated_folder_required');
  result.sourceStatus='ready';
 }catch(e){
  result.sourceStatus='unavailable';
  result.errors.push({type:'source',reason:e.code==='ENOENT'?'source_directory_missing':e.message});
  return result;
 }
 const inbox=path.resolve(dataDir,'rakuten-report-inbox');
 // Do not ingest files from our own output tree or recurse.
 if(root===inbox||inbox.startsWith(root+path.sep)||root.startsWith(inbox+path.sep)){
  result.sourceStatus='invalid_location';result.errors.push({type:'source',reason:'source_and_inbox_overlap'});
  return result;
 }
 let names;
 try{names=fs.readdirSync(root).filter(n=>n.toLowerCase().endsWith('.csv')).sort();}
 catch(e){result.sourceStatus='unavailable';result.errors.push({type:'source',reason:e.code||e.message});return result;}
 for(const name of names){
  result.scanned++;
  try{
   const file=path.join(root,name);
   const stat=fs.lstatSync(file);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>5*1024*1024){
    result.rejected++;continue;
   }
   // Reject files written during the most recent 10s to avoid partial browser downloads.
   if(Date.now()-stat.mtimeMs<10000){result.rejected++;continue;}
   const bytes=fs.readFileSync(file);
   parseRakutenDailyCsv(decode(bytes)); // Strict expected header and numeric/date checks.
   const digest=crypto.createHash('sha256').update(bytes).digest('hex');
   const destination=path.join(inbox,'rakuten-'+digest+'.csv');
   if(fs.existsSync(destination)){result.alreadyCaptured++;continue;}
   fs.mkdirSync(inbox,{recursive:true});
   const temp=destination+'.tmp-'+process.pid;
   try{
    fs.writeFileSync(temp,bytes,{flag:'wx'});
    fs.renameSync(temp,destination);
    result.accepted++;
   }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
  }catch(e){
   // Do not log CSV content or expose user file paths in reports.
   result.rejected++;
   result.errors.push({type:'invalid_or_unreadable_csv',reason:String(e.code||e.message).slice(0,70)});
  }
 }
 return result;
}
