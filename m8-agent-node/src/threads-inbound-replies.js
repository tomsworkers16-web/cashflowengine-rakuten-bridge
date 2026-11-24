// Own-account incoming comments only. No discovery of unrelated accounts.
import {createHash} from 'node:crypto';
const ACCOUNT='rakumitsu_select';
const id=v=>typeof v==='string'&&/^\d{1,30}$/.test(v)?v:null;
const ref=v=>id(typeof v==='object'&&v!==null?v.id:v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const name=v=>typeof v==='string'?v.toLowerCase().replace(/^@/,''):'';
const caution=/https?:\/\/|@|#|クレーム|返品|返金|故障|危険|事故|病気|薬|詐欺|嘘|最悪|違法|政治|宗教|投資|連絡先|住所|電話番号|価格|いくら|サイズ|耐荷重|在庫|どこで買|購入先|リンク|教えて|[?？]|どうすれば|どうしたら|ですか|でしょうか|ませんか|何がおすすめ|おすすめ.*(ある|知りたい)|反対|間違|違う|不快|嫌い|苦情|信用でき|使えない|騙|バカ|ふざけ|\uFFFD/u;
const cleanup=/片[付づ]け|後始末|後処理|洗い物|戻す/u;
const burden=/面倒|めんど[うー]?|手間|負担|大変|億劫|時間がかか|時間を取ら/u;
const appreciation=/わかります|分かります|参考にな|ありがとう|共感|なるほど|助かります/u;
const hold=reason=>({status:'hold',reason});
const review=(text,topic,intent)=>({status:'review',text,topic,intent});
function identifyTopic(parent,root){
 const classify=s=>{
  // The topic is derived from our post, not from the reader's isolated keywords.
  if(/時短|時間を節約|時間を短縮|作業時間|効率化/u.test(s))return 'time_saving';
  if(/掃除|汚れ|ほこり/u.test(s))return 'cleaning';
  if(/収納|整理整頓|引き出し/u.test(s))return 'storage';
  if(/料理|献立|調理|キッチン/u.test(s))return 'kitchen';
  if(/洗濯|洗濯物|干す/u.test(s))return 'laundry';
  return null;
 };
 return classify(parent)||classify(root);
}
export function draftInboundReply(text,parentText,rootText=parentText){
 if(typeof text!=='string'||typeof parentText!=='string'||typeof rootText!=='string'||!text.trim()||!parentText.trim()||text.length>600||caution.test(text))return hold('needs_context_or_review');
 const topic=identifyTopic(parentText,rootText);
 if(!topic)return hold('parent_topic_unclear');
 // Keep uncertainty explicit: unsupported topics, requests, sarcasm and
 // off-topic comments require individual review; no generic filler reply.
 if(/皮肉|笑わせ|逆に|意味ない|意味がない|くだらない|無意味|\b(?:lol|wtf)\b/iu.test(text))return hold('needs_context_or_review');
 if(topic==='time_saving'&&cleanup.test(text)&&burden.test(text))return review('片付けまで含めて一つの作業ですもんね😅 作業時間が短くなっても、後片付けが増えたら本末転倒ですよね。そこまで考えて便利グッズを選びたいところです。',topic,'cleanup_burden');
 if(topic==='time_saving'&&/準備|道具を出|取り出す/u.test(text)&&burden.test(text))return review('準備に時間がかかると、使うまでのハードルが上がりますよね。使い始めるまでの手間も、時短グッズを選ぶ大事なポイントですね。',topic,'setup_burden');
 if(topic==='cleaning'&&cleanup.test(text)&&burden.test(text))return review('掃除の後の片付けまで考えると、つい後回しになりますよね。道具を使う場所の近くに戻せるようにすると、手間を減らす工夫につながりそうです。',topic,'cleanup_burden');
 if(topic==='storage'&&/収納|戻す|取り出す|出し入れ/u.test(text))return review('収納は、しまえる量だけでなく出し入れのしやすさも大事ですね。毎日使う物ほど、戻す動作が少なくて済む置き方を考えたいところです。',topic,'storage_discussion');
 if(topic==='kitchen'&&/洗い物|後片[付づ]け/u.test(text)&&burden.test(text))return review('調理だけでなく洗い物まで考えると、道具が増えるほど負担になることもありますよね。洗いやすさやパーツの少なさにも注目したいです。',topic,'cleanup_burden');
 if(topic==='laundry'&&/干す|畳む|たたむ|取り込/u.test(text)&&burden.test(text))return review('洗濯は洗うだけで終わらないのが大変ですよね。干して取り込んで戻すまでの流れを見直すと、負担を減らすヒントになりそうです。',topic,'laundry_burden');
 if(appreciation.test(text)&&text.length<=100&&!burden.test(text)&&!/収納|掃除|料理|洗濯|片[付づ]け|準備/u.test(text))return review('読んでくださってありがとうございます。暮らしの中で無理なく続けられる工夫を、これからも紹介していきますね。',topic,'appreciation');
 return hold('requires_individual_answer');
}
export function planInboundReplies({account,root,conversation,attempts=[],now=Date.now()}={}){
 if(name(account)!==ACCOUNT||!id(root?.id)||name(root.username)!==ACCOUNT||!Array.isArray(conversation)||!Array.isArray(attempts))return [];
 const own=new Map([[root.id,root]]);for(const r of conversation)if(id(r.id)&&name(r.username)===ACCOUNT&&ref(r.root_post)===root.id)own.set(r.id,r);
 const already=new Set([...attempts.map(r=>r.targetId),...conversation.filter(r=>name(r.username)===ACCOUNT).map(r=>ref(r.replied_to))]);
 const seen=new Set();const out=[];
 for(const r of conversation){
  const parent=own.get(ref(r.replied_to)),t=Date.parse(r.timestamp||'');
  if(!id(r.id)||seen.has(r.id)||already.has(r.id)||!parent||ref(r.root_post)!==root.id||r.is_reply!==true||!name(r.username)||name(r.username)===ACCOUNT||!['NOT_HUSHED','UNHUSHED'].includes(r.hide_status)||!Number.isFinite(t)||t>now||now-t>48*3600000)continue;
  seen.add(r.id);const d=draftInboundReply(r.text,parent.text,root.text);
  const result={targetId:r.id,rootId:root.id,parentId:parent.id,username:r.username,sourceText:r.text,parentText:parent.text,receivedAt:r.timestamp,status:d.status,reason:d.reason??null,draft:d.text??null,topic:d.topic??null,intent:d.intent??null};
  if(d.text)result.digest=hash([ACCOUNT,root.id,r.id,parent.id,r.username,r.text,parent.text,root.text,d.text]);
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
