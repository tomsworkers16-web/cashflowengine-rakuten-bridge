// Exact, single-reply review. No network, posting, or approval by inference.
import {createHash} from 'node:crypto';
import {planDailyReplySuggestions,selectDailyStage,DAILY_AUTO_POLICY} from './threads-daily-cycle.js';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function reviewReplyCandidates({plan,snapshot,history=[],journal=[],date,now=Date.now(),ownUsername}={}){
 if(ownUsername!=='rakumitsu_select'||!Array.isArray(history)||!Array.isArray(journal)||!Array.isArray(snapshot?.candidates))return [];
 const age=now-Date.parse(snapshot.scannedAt||'');if(!Number.isFinite(age)||age<0||age>60*60000)return [];
 if(history.some(r=>r.jstDate===date&&['pending','posted','unverified','uncertain','failed'].includes(r.status)))return [];
 const check=selectDailyStage({plan,autoPolicy:DAILY_AUTO_POLICY,accountUsername:ownUsername,jstDate:date,slot:'07:30',journal:[],officialPostCount:0});
 if(check.status!=='eligible_for_existing_publisher')return [];
 const first=journal.filter(r=>r.jstDate===date&&r.slot==='07:30').at(-1);
 if(!first?.id||!['posted','verified_posted'].includes(first.meta?.publishStatus)||first.meta?.campaignId!==plan.campaignId||first.text!==plan.slots[0].text)return [];
 return planDailyReplySuggestions({candidates:snapshot.candidates,history,ownUsername,theme:plan.theme,date,max:1}).map(d=>{
  const c=snapshot.candidates.find(c=>c.url===d.url&&c.author===d.author&&sha(c.text)===d.sourceDigest);
  if(!c)return null;
  return {...d,sourceText:c.text,reviewDigest:sha([date,plan.campaignId,d.url,d.author,d.sourceDigest,d.replyDraft])};
 }).filter(Boolean);
}

// Exact confirmation only. This record is not consumed by a live sender yet.
export function makeReplyApproval(input,digest){
 const selected=reviewReplyCandidates(input).find(x=>x.reviewDigest===digest);
 if(!selected)return null;
 return {version:'external-reply-review-v1',scope:'single_reply',date:input.date,account:input.ownUsername,url:selected.url,author:selected.author,sourceDigest:selected.sourceDigest,replyDraft:selected.replyDraft,reviewDigest:selected.reviewDigest,approvedByOwner:true};
}
