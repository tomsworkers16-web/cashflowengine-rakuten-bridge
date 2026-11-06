// Offline, privacy-preserving audit of repeatedly rejected Rakuten exports.
// Never prints CSV contents, account IDs, reward amounts, hashes or file paths.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCsv,parseRakutenDailyCsv,stripVerifiedDailyReportPreamble} from './rakuten-csv.js';

const NAME=/^rejected-\d+-\d+\.csv$/i;
function decode(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{return new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
}
export function auditRakutenRejectedExports(dataDir,{maxFiles=20}={}){
 const dir=path.join(path.resolve(dataDir),'rakuten-report-rejected');
 const out={mode:'offline_no_browser',filesChecked:0,distinctContentCount:0,
  duplicateContentGroups:0,latestExactlyRepeated:false,
  invalidDatePlaceholderCount:0,validDateReportCount:0,otherInvalidCount:0,
  latestCategory:'none',nextAction:'no_saved_exports',noPosting:true,noDownload:true};
 if(!fs.existsSync(dir))return out;
 let files;
 try{
  files=fs.readdirSync(dir).filter(n=>NAME.test(n))
   .map(n=>path.join(dir,n)).filter(f=>fs.lstatSync(f).isFile())
   .sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)
   .slice(0,Math.max(1,Math.min(100,maxFiles)));
 }catch{return {...out,latestCategory:'files_unreadable',nextAction:'check_local_files'};}
 const hashes=new Map();
 let newestHash=null;
 for(const file of files){
  let category='other_invalid';
  try{
   const st=fs.statSync(file);
   if(st.size<=0||st.size>5*1024*1024)throw Error('unsafe_size');
   const bytes=fs.readFileSync(file);
   const hash=crypto.createHash('sha256').update(bytes).digest('hex');
   if(newestHash===null)newestHash=hash;
   hashes.set(hash,(hashes.get(hash)||0)+1);
   const content=decode(bytes);
   try{
    parseRakutenDailyCsv(content);
    category='valid_date_report';
   }catch{
    const rows=parseCsv(stripVerifiedDailyReportPreamble(content));
    const header=rows[0]||[],data=rows[1]||[];
    const first=String(header[0]||'').normalize('NFKC').trim().toLowerCase();
    const value=String(data[0]||'').normalize('NFKC').trim().toLowerCase();
    if(['発生日','日付','年月日','成果発生日','date'].includes(first)&&value==='date')
      category='invalid_date_placeholder';
   }
  }catch{category='other_invalid';}
  if(out.filesChecked===0)out.latestCategory=category;
  out.filesChecked++;
  if(category==='invalid_date_placeholder')out.invalidDatePlaceholderCount++;
  else if(category==='valid_date_report')out.validDateReportCount++;
  else out.otherInvalidCount++;
 }
 out.distinctContentCount=hashes.size;
 out.duplicateContentGroups=[...hashes.values()].filter(count=>count>1).length;
 out.latestExactlyRepeated=newestHash!==null&&(hashes.get(newestHash)||0)>1;
 out.nextAction=out.latestCategory==='invalid_date_placeholder'
  ?'inspect_rakuten_ui_export_type_before_more_downloads'
  :out.latestCategory==='valid_date_report'?'retry_offline_import'
  :out.filesChecked?'inspect_csv_structure':'no_saved_exports';
 return out;
}
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const result=auditRakutenRejectedExports(process.env.CFE_DATA_DIR||'.data');
 console.log(JSON.stringify(result,null,2));
}
