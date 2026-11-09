import path from 'node:path';
import {readLocalThreadHooks} from './threads-hook-diagnostics.js';
const date=process.argv.find(x=>/^--day=\d{4}-\d{2}-\d{2}$/.test(x))?.slice(6)
 ??new Date(Date.now()+9*3600000).toISOString().slice(0,10);
try{console.log(JSON.stringify(readLocalThreadHooks(path.resolve(process.env.CFE_DATA_DIR||'.data'),date,7),null,2));}
catch{console.error(JSON.stringify({status:'failed',reason:'threads_hook_diagnostic_unavailable'}));process.exitCode=1;}
