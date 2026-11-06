// Read-only structural status for Rakuten files previously rejected on import.
// Never print financial rows, filenames or account-specific CSV content.
import fs from 'node:fs';
import path from 'node:path';
import {parseRakutenDailyCsv} from './rakuten-csv.js';

export function inspectRejectedRakutenCsv(dataDir){
 const folder=path.join(path.resolve(dataDir),'rakuten-report-rejected');
 const result={filesFound:0,latestStatus:'none',latestFileAgeHours:'unknown',
  latestBytes:'unknown',nextStep:'none'};
 if(!fs.existsSync(folder))return result;
 let candidates;
 try{
  candidates=fs.readdirSync(folder).filter(x=>/^rejected-\d+-\d+\.csv$/i.test(x))
   .map(name=>path.join(folder,name))
   .filter(file=>fs.lstatSync(file).isFile())
   .sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
 }catch{return {...result,latestStatus:'directory_unreadable',nextStep:'check_local_files'};}
 result.filesFound=candidates.length;
 if(!candidates.length)return result;
 const latest=candidates[0];
 try{
  const st=fs.statSync(latest);
  result.latestFileAgeHours=Math.max(0,Math.round((Date.now()-st.mtimeMs)/3600000));
  result.latestBytes=st.size;
  if(st.size===0||st.size>5*1024*1024)throw Error('invalid_csv_size');
  const bytes=fs.readFileSync(latest);
  let csv;
  try{csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{csv=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
  parseRakutenDailyCsv(csv);
  result.latestStatus='valid_unimported';
  result.nextStep='retry_offline_import';
 }catch(error){
  const code=String(error?.message||'');
  if(/^invalid_date_row_\d+/.test(code)){
   result.latestStatus='daily_date_value_invalid';
   result.nextStep='inspect_rakuten_report_export';
  }else if(/invalid_csv_quotes|no_supported_metrics|date_column_missing|csv_column_count_mismatch|no_data_rows|invalid_/.test(code)){
   result.latestStatus='csv_schema_or_values_invalid';
   result.nextStep='inspect_rakuten_report_export';
  }else{
   result.latestStatus='unreadable';
   result.nextStep='check_local_files';
  }
 }
 return result;
}
