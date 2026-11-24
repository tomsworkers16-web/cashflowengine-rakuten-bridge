// Local review; explicit approval records one exact draft, never sends or enables it.
import fs from 'node:fs';
import path from 'node:path';
import {reviewReplyCandidates,makeReplyApproval} from './threads-reply-review.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return null;}};
const rows=name=>{const f=path.join(dir,name);if(!fs.existsSync(f))return [];return fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));};
try{
 const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 const input={date,plan:read('threads-daily-proposal.json'),snapshot:read('external-reply-candidates.json'),history:rows('external-replies.jsonl'),journal:rows('posts.jsonl'),ownUsername:read('state.json')?.threadsUsername};
 if(process.argv.length===2){console.log(JSON.stringify({mode:'review_only',date,suggestions:reviewReplyCandidates(input),published:0},null,2));}
 else{
  if(process.argv.length!==4||process.argv[2]!=='--approve-one')throw Error('invalid_action');
  const approval=makeReplyApproval(input,process.argv[3]);if(!approval)throw Error('stale_or_changed_review');
  const file=path.join(dir,'threads-external-reply-review-'+date+'.json');
  fs.writeFileSync(file,JSON.stringify(approval,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({mode:'single_reply_approval_recorded',date,published:0,sendEnabled:false}));
 }
}catch{console.error(JSON.stringify({status:'review_unavailable',published:0}));process.exitCode=1;}
