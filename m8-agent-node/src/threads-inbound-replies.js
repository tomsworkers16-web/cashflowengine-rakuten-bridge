// Own-account incoming comments only. No discovery of unrelated accounts.
import {createHash} from 'node:crypto';
const ACCOUNT='rakumitsu_select';
const id=v=>typeof v==='string'&&/^\d{1,30}$/.test(v)?v:null;
const ref=v=>id(typeof v==='object'&&v!==null?v.id:v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const name=v=>typeof v==='string'?v.toLowerCase().replace(/^@/,''):'';
const caution=/https?:\/\/|@|#|クレーム|返品|返金|故障|危険|事故|病気|薬|詐欺|嘘|最悪|違法|政治|宗教|投資|連絡先|住所|電話番号|価格|いくら|サイズ|耐荷重|在庫|どこで買|購入先|リンク|教えて|教えてください|[?？]/u;
export function draftInboundReply(text,parentText){
 if(typeof text!=='string'||typeof parentText!=='string'||!text.trim()||text.length>600||caution.test(text))return {status:'hold',reason:'needs_context_or_review'};
 const all=parentText+' '+text;
 if(/収納|片付け|整理/u.test(all)&&/収納|片付け|戻す|取り出す|出し入れ/u.test(text))return {status:'review',text:'コメントありがとうございます。しまう場所だけでなく、取り出して戻すまでの動作も見直すと、使いやすい収納を考えやすいですね。'};
 if(/掃除|汚れ/u.test(all)&&/掃除|片付け|道具/u.test(text))return {status:'review',text:'コメントありがとうございます。掃除道具を使う場所の近くに置くと、準備や片付けの手間も見直しやすいですね。'};
 if(/わかります|参考にな|ありがとう|共感|なるほど|助かります/u.test(text)&&text.length<=100)return {status:'review',text:'コメントありがとうございます。暮らしの中で無理なく続けられる工夫を、これからも紹介していきますね。'};
 return {status:'hold',reason:'requires_individual_answer'};
}
export function planInboundReplies({account,root,conversation,attempts=[],now=Date.now()}={}){
 if(name(account)!==ACCOUNT||!id(root?.id)||name(root.username)!==ACCOUNT||!Array.isArray(conversation)||!Array.isArray(attempts))return [];
 const own=new Map([[root.id,root]]);for(const r of conversation)if(id(r.id)&&name(r.username)===ACCOUNT&&ref(r.root_post)===root.id)own.set(r.id,r);
 const already=new Set([...attempts.map(r=>r.targetId),...conversation.filter(r=>name(r.username)===ACCOUNT).map(r=>ref(r.replied_to))]);
 const seen=new Set();const out=[];
 for(const r of conversation){
  const parent=own.get(ref(r.replied_to)),t=Date.parse(r.timestamp||'');
  if(!id(r.id)||seen.has(r.id)||already.has(r.id)||!parent||ref(r.root_post)!==root.id||r.is_reply!==true||!name(r.username)||name(r.username)===ACCOUNT||!['NOT_HUSHED','UNHUSHED'].includes(r.hide_status)||!Number.isFinite(t)||t>now||now-t>48*3600000)continue;
  seen.add(r.id);const d=draftInboundReply(r.text,parent.text);
  const result={targetId:r.id,rootId:root.id,parentId:parent.id,username:r.username,sourceText:r.text,parentText:parent.text,status:d.status,reason:d.reason??null,draft:d.text??null};
  if(d.text)result.digest=hash([ACCOUNT,root.id,r.id,parent.id,r.username,r.text,parent.text,d.text]);
  out.push(result);
 }
 return out;
}
export function selectInboundApproval(candidates,digest){return candidates.find(c=>c.status==='review'&&c.digest===digest)||null;}

// Caller must explicitly approve the exact fresh digest. Reserve the target
// durably before any write; any ambiguous outcome is held for manual review.
export async function sendOneApprovedInbound({candidates,digest,reserve,create,publish,verify}={}){
 const c=selectInboundApproval(candidates||[],digest);
 if(!c||!id(c.targetId)||!id(c.rootId)||typeof reserve!=='function'||typeof create!=='function'||typeof publish!=='function'||typeof verify!=='function')return {status:'hold',reason:'approval_missing'};
 if(!await reserve(c))return {status:'hold',reason:'already_reserved'};
 try{
  const container=await create(c);if(!id(container?.id))return {status:'uncertain',reason:'container_id_missing'};
  const result=await publish(container.id);if(!id(result?.id))return {status:'uncertain',reason:'publication_id_missing'};
  const r=await verify(result.id);
  if(r?.id!==result.id||name(r.username)!==ACCOUNT||ref(r.replied_to)!==c.targetId||ref(r.root_post)!==c.rootId||r.text!==c.draft||r.is_reply!==true)return {status:'uncertain',reason:'reply_not_verified'};
  return {status:'posted',targetId:c.targetId,id:r.id};
 }catch{return {status:'uncertain',reason:'write_or_verification_failed'};}
}
