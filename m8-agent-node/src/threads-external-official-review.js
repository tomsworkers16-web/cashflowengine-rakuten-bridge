// Official API, one public discussion candidate for human review. No automated
// unsolicited publishing, engagement ranking, or permission workarounds.
import {createHash} from 'node:crypto';
import {scoreCandidate,looksCorruptedJapanese} from './external-reply-engine.js';
const ACCOUNT='rakumitsu_select';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lower=v=>typeof v==='string'?v.toLowerCase().replace(/^@/,''):'';
const topics={storage:'収納',cleaning:'掃除',kitchen_textiles:'洗い物',food_preservation:'保存容器',digital:'配線',cooking:'調理'};
export const queryForTheme=theme=>topics[theme]||null;
const invitation=/教えて|どうしてる|どうしていますか|おすすめ.*(?:ありますか|ありませんか)|何か.*(?:方法|工夫).*[？?]|どうすれば|アドバイス/u;
const caution=/https?:\/\/|@|#|政治|宗教|病気|薬|投資|事故|危険|火事|返品|返金|詐欺|クレーム|炎上|個人情報|子ども|赤ちゃん|\uFFFD/u;
export function canonicalExternalUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!['www.threads.com','threads.com','www.threads.net','threads.net'].includes(u.hostname)||!/^\/@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return null;return u.pathname.replace(/\/$/,'');}catch{return null;}}
export function draftExternalAdvice(text,theme){
 if(typeof text!=='string'||text.length<18||text.length>400||caution.test(text)||!invitation.test(text)||looksCorruptedJapanese(text))return null;
 // Answer the concrete problem; never recommend unverified goods or add advertising.
 if(theme==='storage'&&/収納|片付け|整理/u.test(text)&&/戻す|出し入れ|取り出|片付け/u.test(text))return '収納を考えるときは、よく使う物だけ使う場所の近くに置いてみると、出し入れの手間を見直しやすいです。まずは一か所から試すのもよさそうですね。';
 if(theme==='cleaning'&&/掃除/u.test(text)&&/道具|準備|片付け/u.test(text))return '掃除道具の出し入れが面倒なら、使う場所ごとに必要な道具をまとめる方法もあります。掃除する時間だけでなく、準備と片付けの動きも見直してみるとよさそうです。';
 if(theme==='kitchen_textiles'&&/洗い物|水切り|ふきん|布巾/u.test(text))return '洗い物の後片付けを見直すなら、乾かす場所と洗い替えの置き場所を先に決めると、道具の数やサイズを考えやすくなりそうです。';
 if(theme==='food_preservation'&&/保存容器/u.test(text)&&/置き場|収納|サイズ/u.test(text))return '冷蔵庫の棚の高さと奥行きを測っておくと、保存容器のサイズを比較しやすいです。使わないときに重ねて置けるかも確認したいですね。';
 if(theme==='digital'&&/配線|ケーブル/u.test(text)&&/整理|片付|長さ|置き場/u.test(text))return '配線を整理する前に、使う機器と必要なケーブルの長さを書き出しておくと、余分な線を見分けやすいです。抜き差しする場所も確認しておくと便利ですね。';
 if(theme==='cooking'&&/調理|料理/u.test(text)&&/準備|片付|洗い物/u.test(text))return '調理道具を選ぶときは、使う時間だけでなく準備と洗い物も含めて比較するとよさそうです。よく使う道具を先に見直すと、買い足す物も判断しやすいですね。';
 return null;
}
export function selectOfficialExternalReview({rows,theme,history=[],account,now=Date.now()}={}){
 if(account!==ACCOUNT||!queryForTheme(theme)||!Array.isArray(rows)||!Array.isArray(history))return null;
 const day=new Date(now+9*3600000).toISOString().slice(0,10);
 if(history.some(r=>r.jstDate===day))return null;
 const seen=new Set(history.map(r=>canonicalExternalUrl(r.url)).filter(Boolean));
 const authors=new Set(history.map(r=>lower(r.author)).filter(Boolean));
 for(const r of rows){
  const u=canonicalExternalUrl(r?.permalink),author=lower(r?.username),received=Date.parse(r?.timestamp||'');
  if(!u||!author||author===ACCOUNT||!u.toLowerCase().startsWith('/@'+author+'/post/')||!/^\d{1,30}$/.test(r?.id||'')||r.is_reply!==false||seen.has(u)||authors.has(author)||!Number.isFinite(received)||received>now||now-received>48*3600000)continue;
  if(!scoreCandidate({author,url:r.permalink,text:r.text},{ownUsername:ACCOUNT}).eligible)continue;
  const draft=draftExternalAdvice(r.text,theme);if(!draft)continue;
  return {mode:'review_only',jstDate:day,targetId:r.id,author:r.username,url:r.permalink,sourceText:r.text,receivedAt:r.timestamp,theme,draft,digest:hash([ACCOUNT,day,r.id,u,r.username,r.text,r.timestamp,theme,draft]),published:0};
 }
 return null;
}

// Explicit operator approval of the exact draft and freshly matched target.
// A durable reservation is mandatory, and an ambiguous response is never retried.
export async function sendReviewedExternal({candidate,digest,reserve,create,publish,verify}={}){
 if(!candidate||candidate.digest!==digest||!/^\d{1,30}$/.test(candidate.targetId)||typeof reserve!=='function'||typeof create!=='function'||typeof publish!=='function'||typeof verify!=='function')return {status:'hold',reason:'approval_mismatch'};
 if(!await reserve(candidate))return {status:'hold',reason:'already_reserved'};
 try{const c=await create(candidate);if(!/^\d{1,30}$/.test(c?.id||''))return {status:'uncertain',reason:'container_missing'};
 const result=await publish(c.id);if(!/^\d{1,30}$/.test(result?.id||''))return {status:'uncertain',reason:'publication_id_missing'};
 const row=await verify(result.id);if(row?.id!==result.id||lower(row.username)!==ACCOUNT||row.text!==candidate.draft||row.is_reply!==true||String(row.replied_to?.id??row.replied_to)!==candidate.targetId)return {status:'uncertain',reason:'reply_not_verified'};
 return {status:'posted',id:row.id};}catch{return {status:'uncertain',reason:'send_or_verification_failed'};}
}
