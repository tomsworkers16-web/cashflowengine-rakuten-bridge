import fs from 'node:fs';
import path from 'node:path';
import {parseRakutenDailyCsv,mergeDailySnapshot} from './rakuten-csv.js';

export function importRakutenReportFiles(dataDir, files) {
  const ledger=path.join(dataDir,'affiliate-results.json');
  const result={filesSeen:files.length,imported:[],failures:[]};
  for(const file of files){
    try{
      if(!/\.csv$/i.test(file))throw Error('csv_extension_required');
      if(fs.statSync(file).size>5*1024*1024)throw Error('csv_too_large');
      const bytes=fs.readFileSync(file);
      let csv;
      if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)csv=bytes.toString('utf8');
      else{
        const utf8=new TextDecoder('utf-8',{fatal:true});
        try{csv=utf8.decode(bytes);}catch{csv=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
      }
      const incoming=parseRakutenDailyCsv(csv);
      const current=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{records:[]};
      if(!Array.isArray(current.records))throw Error('invalid_existing_ledger');
      const next=mergeDailySnapshot(current,incoming);
      fs.mkdirSync(dataDir,{recursive:true});
      const temp=ledger+'.import-tmp-'+process.pid;
      try{
        fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{encoding:'utf8',flag:'wx'});
        fs.renameSync(temp,ledger);
      }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
      result.imported.push({filename:path.basename(file),daysUpdated:incoming.length});
    }catch(e){result.failures.push({filename:path.basename(file),error:e.message});}
  }
  return result;
}
export function scanRakutenInbox(dataDir) {
  const inbox=path.join(dataDir,'rakuten-report-inbox');
  if(!fs.existsSync(inbox))return {filesSeen:0,imported:[],failures:[]};
  const files=fs.readdirSync(inbox).filter(x=>/\.csv$/i.test(x))
    .map(name=>path.join(inbox,name)).filter(p=>fs.statSync(p).isFile())
    .sort((a,b)=>fs.statSync(a).mtimeMs-fs.statSync(b).mtimeMs);
  return importRakutenReportFiles(dataDir,files);
}

// Recover old downloads that were rejected before the parser was corrected.
// This never opens a browser, submits a post, or replaces existing daily totals.
// Process newest candidate first so overlapping rejected files cannot replace
// a more recent snapshot. A separate confirmed source remains authoritative.
export function recoverRakutenRejectedFiles(dataDir) {
 const folder=path.join(dataDir,'rakuten-report-rejected');
 const outcome={filesSeen:0,filesRecovered:0,daysRecovered:0,filesIgnored:0,failures:[]};
 if(!fs.existsSync(folder))return outcome;
 const ledger=path.join(dataDir,'affiliate-results.json');
 let current;
 try{
  current=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{records:[]};
  if(!Array.isArray(current.records))throw Error('invalid_ledger');
 }catch{
  outcome.failures.push({reason:'ledger_unreadable'});
  return outcome;
 }
 const candidates=fs.readdirSync(folder).filter(x=>/^rejected-[0-9]+-[0-9]+\.csv$/i.test(x))
  .map(name=>path.join(folder,name)).filter(file=>{
   const st=fs.lstatSync(file);
   return st.isFile()&&!st.isSymbolicLink();
  }).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs).slice(0,25);
 const present=new Set(current.records.map(x=>x.jstDate).filter(Boolean));
 let changed=false;
 for(const file of candidates){
  outcome.filesSeen++;
  try{
   const bytes=fs.readFileSync(file);
   if(bytes.length===0||bytes.length>5*1024*1024)throw Error('unsupported_size');
   let csv;
   try{csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
   catch{csv=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
   const rows=parseRakutenDailyCsv(csv);
   const fresh=rows.filter(x=>!present.has(x.jstDate));
   if(!fresh.length){outcome.filesIgnored++;continue;}
   // A verified report may contain historical dates. Only missing dates are
   // added; old quarantined exports never overwrite a newer daily snapshot.
   current=mergeDailySnapshot(current,fresh);
   for(const row of fresh)present.add(row.jstDate);
   outcome.filesRecovered++;
   outcome.daysRecovered+=fresh.length;
   changed=true;
  }catch{
   // A malformed file stays in quarantine. Never reveal financial rows.
   outcome.failures.push({reason:'rejected_csv_still_invalid'});
  }
 }
 if(changed){
  fs.mkdirSync(dataDir,{recursive:true});
  const tmp=ledger+'.recovery-tmp-'+process.pid;
  try{
   fs.writeFileSync(tmp,JSON.stringify(current,null,2)+'\n',{encoding:'utf8',flag:'wx'});
   fs.renameSync(tmp,ledger);
  }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}
 }
 return outcome;
}
