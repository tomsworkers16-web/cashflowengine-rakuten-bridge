import path from 'node:path';
import {readLocalPostProductEvidence} from './post-product-evidence.js';
const now=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const day=process.argv.find(x=>/^--day=\d{4}-\d{2}-\d{2}$/.test(x))?.slice(6)??now;
try{
 const result=readLocalPostProductEvidence(path.resolve(process.env.CFE_DATA_DIR||'.data'),day,7);
 console.log(JSON.stringify(result,null,2));
}catch{console.error(JSON.stringify({status:'failed',reason:'post_product_evidence_unavailable'}));process.exitCode=1;}
