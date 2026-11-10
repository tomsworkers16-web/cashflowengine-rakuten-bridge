// Provider-independent editorial workflow. A writer must be injected explicitly.
// No credentials, network calls or publishing in this module.
import {researchMagazineIssue} from './magazine-research.js';
import {validatePublicationText} from './product-posting.js';
export function buildWriterBrief(issue){
 return {topic:issue.title,series:issue.series,format:issue.format,
  instructions:['読者に役立つ読み物を自然な日本語で書く。','架空の体験・口コミ・効果・仕様を書かない。','商品を買わなくても役立つ情報を含める。','同じ説明を繰り返さない。','通常投稿は500文字以内。広告リンクは執筆者が生成しない。'],
  editorialSeed:issue.text,
  evidence:(issue.candidates||[]).map(({itemCode,itemName,price})=>({itemCode,itemName,price,verifiedSpecifications:false}))};
}
export function reviewArticle(text){
 const errors=[];
 if(validatePublicationText(text))errors.push('invalid_text');
 if(/https?:\/\/|【PR】/u.test(String(text)))errors.push('unexpected_commercial_content');
 if(/使ってみた|愛用中|実際に使|絶対|必ず|爆売れ|最安/u.test(String(text)))errors.push('unsupported_claim_review');
 const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
 if(new Set(lines).size!==lines.length)errors.push('duplicate_line');
 return {status:errors.length?'rejected':'manual_editorial_review_required',errors,
  checksStillRequired:['factual_accuracy','natural_voice','reader_value','source_support']};
}
export async function draftMagazineIssue(day,slot,{search,writer}={}){
 const issue=await researchMagazineIssue(day,slot,{search});
 const brief=buildWriterBrief(issue);
 if(typeof writer!=='function')return {status:'writer_not_configured',brief,article:null};
 let article;
 try{article=await writer(brief);}catch{return {status:'writer_failed',article:null};}
 const review=reviewArticle(article);
 return {status:review.status,topicId:issue.topicId,format:issue.format,
  article:review.errors.length?null:article,review,publicationAllowed:false};
}
