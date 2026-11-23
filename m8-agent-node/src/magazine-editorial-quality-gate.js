// Editorial quality gate v1: explicit independent reviewer evidence, not keyword-based "quality AI" claims.
// Scoring is a provisional editorial judgement; only real Threads/affiliate data validates performance.
export const QUALITY_WEIGHTS=Object.freeze({newInsight:30,practicalSpecificity:25,factualSupport:20,naturalWriting:15,productFit:10});
const REQUIRED=['newInsight','practicalSpecificity','factualSupport','naturalWriting','productFit'];
const hasText=x=>typeof x==='string'&&x.trim().length>=12&&x.trim().length<=240;
export function assessEditorialQuality(review,{article}={}){
 const denied={status:'quality_revision_required',qualityAccepted:false,publicationAllowed:false,
  scores:null,total:null,reasons:[],reviewerAssessmentNotIndependentProof:true};
 if(!review||typeof review!=='object'||review.decision!=='accept')return {...denied,reasons:['reviewer_did_not_accept']};
 const scores=review.qualityScores;
 if(!scores||typeof scores!=='object'||REQUIRED.some(k=>!Number.isInteger(scores[k])||scores[k]<0||scores[k]>QUALITY_WEIGHTS[k]))
  return {...denied,reasons:['quality_scores_missing_or_invalid']};
 const total=REQUIRED.reduce((n,k)=>n+scores[k],0),reasons=[];
 if(total<80)reasons.push('quality_below_80');
 if(scores.newInsight<20)reasons.push('new_insight_too_weak');
 if(scores.practicalSpecificity<18)reasons.push('actionable_detail_too_weak');
 if(scores.factualSupport<15)reasons.push('factual_support_too_weak');
 if(!hasText(review.insightStatement)||!hasText(review.actionableTakeaway))reasons.push('insight_or_takeaway_not_explained');
 // A reviewer must identify at least one claim + its verification state: a blank string is not verification.
 if(!Array.isArray(review.claimChecks)||review.claimChecks.length===0||
  review.claimChecks.some(c=>!hasText(c?.claim)||!['source_verified','needs_verification'].includes(c?.status)||
   (c.status==='source_verified'&&!/^https:\/\//.test(String(c.sourceUrl||'')))))
  reasons.push('claim_checks_missing_or_invalid');
 const unverifiedClaims=Array.isArray(review.claimChecks)?review.claimChecks.filter(c=>c.status==='needs_verification').length:null;
 if(unverifiedClaims>0)reasons.push('claims_need_verification');
 if(typeof article!=='string'||article.trim().length<30)reasons.push('article_too_short_for_quality_review');
 return {status:reasons.length?'quality_revision_required':'quality_passed_for_owner_review',
  qualityAccepted:reasons.length===0,total,scores:Object.fromEntries(REQUIRED.map(k=>[k,scores[k]])),
  reasons,insightStatement:review.insightStatement||null,actionableTakeaway:review.actionableTakeaway||null,
  unverifiedClaims,reviewerAssessmentNotIndependentProof:true,publicationAllowed:false,
  needsOwnerApproval:true,performanceEvidence:'not_measured'};
}
