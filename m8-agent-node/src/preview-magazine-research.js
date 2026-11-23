import {researchMagazineIssue,createRakutenEditorialSearch} from './magazine-research.js';
const day=process.argv[2]||new Date(Date.now()+9*3600000).toISOString().slice(0,10);
try{const result=await researchMagazineIssue(day,'19:30',{search:createRakutenEditorialSearch()});console.log(JSON.stringify(result,null,2));}
catch(e){console.error(JSON.stringify({status:'failed',reason:/^rakuten_|^invalid_issue_date$/.test(e.message)?e.message:'research_failed'}));process.exitCode=1;}
