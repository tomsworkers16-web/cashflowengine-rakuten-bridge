import path from 'node:path';
import {readAgeMatchedThreads} from './threads-age-matched-insights.js';
const day=process.argv.find(x=>/^--day=\d{4}-\d{2}-\d{2}$/.test(x))?.slice(6)
 ??new Date(Date.now()+9*3600000).toISOString().slice(0,10);
try{console.log(JSON.stringify(readAgeMatchedThreads(path.resolve(process.env.CFE_DATA_DIR||'.data'),day,7),null,2));}
catch{console.error(JSON.stringify({status:'failed',reason:'threads_age_matched_evidence_unavailable'}));process.exitCode=1;}
