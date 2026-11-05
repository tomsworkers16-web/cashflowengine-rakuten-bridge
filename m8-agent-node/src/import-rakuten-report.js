import fs from 'node:fs';
import path from 'node:path';
import { parseRakutenDailyCsv, mergeDailySnapshot } from './rakuten-csv.js';

const dataDir = path.resolve(process.env.CFE_DATA_DIR || '.data');
const inbox = path.join(dataDir, 'rakuten-report-inbox');
const ledger = path.join(dataDir, 'affiliate-results.json');
const mode = process.argv[2] || '--scan';
const requestedPath = process.argv[3];

function readLedger() {
  if (!fs.existsSync(ledger)) return { records: [] };
  const x = JSON.parse(fs.readFileSync(ledger,'utf8'));
  if (!x || !Array.isArray(x.records)) throw Error('invalid_existing_ledger');
  return x;
}
function writeLedger(next) {
  fs.mkdirSync(dataDir,{recursive:true});
  const temp = ledger + '.import-tmp-' + process.pid;
  try {
    fs.writeFileSync(temp, JSON.stringify(next,null,2) + '\n', {encoding:'utf8',flag:'wx'});
    fs.renameSync(temp,ledger);
  } finally { if(fs.existsSync(temp)) fs.rmSync(temp,{force:true}); }
}
function importFile(file) {
  const csv = fs.readFileSync(file,'utf8');
  const incoming = parseRakutenDailyCsv(csv);
  const next = mergeDailySnapshot(readLedger(),incoming);
  writeLedger(next);
  return {filename:path.basename(file), daysUpdated:incoming.length, totalRecords:next.records.length};
}
const selected = mode === '--file' && requestedPath ? [path.resolve(requestedPath)]
  : mode === '--scan' ? fs.existsSync(inbox) ? fs.readdirSync(inbox)
      .filter(f => /\.csv$/i.test(f)).sort().map(f=>path.join(inbox,f)) : []
  : null;
if(!selected)throw Error('usage: import-rakuten-report --scan | --file <csv-path>');
const imported=[];const failures=[];
for(const file of selected) {
  try {imported.push(importFile(file));}
  catch(e){failures.push({filename:path.basename(file),error:e.message});}
}
const result={mode:'offline_rakuten_csv_import',postingPerformed:false,filesSeen:selected.length,imported,failures,
  dataPath:ledger};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
