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
