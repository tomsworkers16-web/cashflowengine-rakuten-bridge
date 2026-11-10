// Provider-independent editorial workflow. A writer must be injected explicitly.
// No credentials, network calls or publishing in this module.
import {researchMagazineIssue} from './magazine-research.js';
import {validatePublicationText} from './product-posting.js';
export function buildWriterBrief(issue){
 return {topic:issue.title,series:issue.series,format:issue.format,
  voicePolicy:{version:'conversation-v1',goal:'読者と会話するように、最後まで読みたくなる暮らしの記事',approaches:['共感から具体例へ','意外な発見から理由へ','読者への相談から比較へ','場面を想像して解説へ'],lengthGuidance:'短文は一つの気づき、中文は一つの選択基準、特集は具体例と理由を展開。長さは内容で決める。'},
  instructions:['読者に役立つ読み物を自然な日本語で書く。','読者が自分の暮らしを思い浮かべる具体的な場面を入れ、会話の流れで説明する。','問いかけや冗談は必要なときだけ使う。語尾や冒頭を定型化しない。','一人語りや抽象論を避け、読者の疑問に答え、新しい視点を一つ届ける。','長くするための繰り返しは避ける。親しみやすさのために実体験を捏造しない。','架空の体験・口コミ・効果・仕様を書かない。','商品を買わなくても役立つ情報を含める。','同じ説明を繰り返さない。','通常投稿は500文字以内。広告リンクは執筆者が生成しない。'],
  editorialSeed:issue.text,
  evidence:(issue.candidates||[]).map(({itemCode,itemName,price})=>({itemCode,itemName,price,verifiedSpecifications:false}))};
}
export function reviewArticle(text){
 const errors=[];
 if(validatePublicationText(text))errors.push('invalid_text');
 if(/https?:\/\/|【PR】/u.test(String(text)))errors.push('unexpected_commercial_content');
 if(/使ってみた|愛用中|実際に使|絶対|必ず|爆売れ|最安/u.test(String(text)))errors.push('unsupported_claim_review');
 const warnings=[];
 const body=String(text||'');
 const questions=(body.match(/[？?]/gu)||[]).length;
 if(questions>=4)warnings.push('review_excessive_questions');
 if((body.match(/ですよね|じゃないですか|ませんか/gu)||[]).length>=4)warnings.push('review_repetitive_conversation_endings');
 const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
 if(new Set(lines).size!==lines.length)errors.push('duplicate_line');
 return {status:errors.length?'rejected':'manual_editorial_review_required',errors,warnings,
  checksStillRequired:['factual_accuracy','natural_voice','reader_value','source_support','conversational_flow','concrete_reader_scene','length_earns_attention']};
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
