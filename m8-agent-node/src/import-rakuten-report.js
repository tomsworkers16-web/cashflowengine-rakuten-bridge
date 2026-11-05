// No browser or API access: safely load a locally downloaded Rakuten report.
import path from 'node:path';
import {importRakutenReportFiles,scanRakutenInbox} from './rakuten-report-importer.js';
const dataDir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const mode=process.argv[2]||'--scan';
const result=mode==='--scan' ? scanRakutenInbox(dataDir)
  : mode==='--file'&&process.argv[3] ? importRakutenReportFiles(dataDir,[path.resolve(process.argv[3])])
  : null;
if(!result)throw Error('usage: import-rakuten-report --scan | --file <csv-path>');
console.log(JSON.stringify({mode:'offline_rakuten_csv_import',postingPerformed:false,...result},null,2));
if(result.failures.length)process.exitCode=1;
