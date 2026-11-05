// Read-only confirmation that a locally recorded Threads post exists on official API.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function confirmOfficialPost(journal, official, id) {
 const postId=String(id||'');
 if(!/^\d{10,25}$/.test(postId))throw Error('invalid_post_id');
 const local=journal.filter(row=>String(row?.id||'')===postId).at(-1);
 if(!local)return {ok:false,status:'not_in_local_journal',postId};
 const match=official.find(row=>String(row?.id||'')===postId);
 if(!match)return {ok:false,status:'not_in_fetched_official_timeline',postId,
   note:'The returned timeline may be paginated; absence here does not prove deletion.'};
 const textMatched=String(match.text||'').trim()===String(local.text||'').trim();
 const linkMatched=local.meta?.affiliate
  ? (String(match.text||'').includes('https://hb.afl.rakuten.co.jp/') && textMatched) : true;
 return {ok:textMatched&&linkMatched,
  status:textMatched&&linkMatched?'officially_confirmed':'content_mismatch',
  postId,localSlot:local.slot||null,role:local.meta?.role||null,
  affiliate:local.meta?.affiliate===true,
  publicationTimestamp:match.timestamp||null,permalink:match.permalink||null,
  textMatched,affiliateLinkMatched:linkMatched};
}
export async function runOfficialVerification({id,env=process.env}={}){
 const token=env.THREADS_ACCESS_TOKEN;
 if(!token)throw Error('threads_access_token_missing');
 const dataDir=path.resolve(env.CFE_DATA_DIR||'.data');
 const file=path.join(dataDir,'posts.jsonl');
 if(!fs.existsSync(file))throw Error('posts_journal_missing');
 const journal=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const postId=id||String([...journal].reverse().find(x=>x?.id)?.id||'');
 if(!/^\d{10,25}$/.test(postId))throw Error('no_valid_post_id_to_verify');
 const base=env.THREADS_API_BASE||'https://graph.threads.net/v1.0';
 const u=new URL(base+'/me/threads');
 for(const [k,v]of Object.entries({fields:'id,text,timestamp,permalink',limit:100,access_token:token}))
  u.searchParams.set(k,v);
 const abort=new AbortController();
 const timeout=setTimeout(()=>abort.abort(),15000);
 let response;
 try{
  const r=await fetch(u,{signal:abort.signal});
  response=await r.json();
  if(!r.ok)throw Error('threads_api_http_'+r.status);
 }finally{clearTimeout(timeout);}
 if(!Array.isArray(response?.data))throw Error('threads_timeline_invalid');
 return confirmOfficialPost(journal,response.data,postId);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 runOfficialVerification({id:process.argv[2]})
  .then(result=>{console.log(JSON.stringify({mode:'official_read_only',postingPerformed:false,...result},null,2));
   if(!result.ok)process.exitCode=2;})
  .catch(error=>{console.error(JSON.stringify({ok:false,postingPerformed:false,error:error.message}));process.exitCode=1;});
}
