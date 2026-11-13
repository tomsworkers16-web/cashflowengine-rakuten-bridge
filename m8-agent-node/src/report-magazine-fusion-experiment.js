// Offline experiment report: reads only local files, never publishes or uses external APIs.
import fs from 'node:fs';
import path from 'node:path';
import {summarizeFusionExperiment} from './magazine-fusion-experiment.js';
import {asciiJson} from './magazine-listing-snapshot.js';
function json(pathname){return JSON.parse(fs.readFileSync(pathname,'utf8'));}
function jsonl(pathname){return fs.readFileSync(pathname,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));}
try{
 const [dataDir,assignmentsFile,day]=process.argv.slice(2);
 if(!dataDir||!assignmentsFile||!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('invalid_arguments');
 const assignments=json(assignmentsFile);
 const posts=jsonl(path.join(dataDir,'posts.jsonl'));
 const files=fs.readdirSync(path.join(dataDir,'reports')).filter(f=>/^\d{4}-\d{2}-\d{2}-night\.json$/.test(f)).sort().slice(-40);
 const reports=files.map(f=>{try{return json(path.join(dataDir,'reports',f));}catch{return null;}}).filter(Boolean);
 const result=summarizeFusionExperiment(assignments,posts,reports,{targetDay:day});
 console.log(asciiJson(result));
}catch(e){console.error(JSON.stringify({status:'failed',reason:/^(?:experiment_)/.test(String(e.message))?e.message:'fusion_experiment_input_or_report_invalid'}));process.exitCode=1;}
