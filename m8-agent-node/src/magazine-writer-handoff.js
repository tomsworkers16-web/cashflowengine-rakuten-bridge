// Manual AI handoff: no paid API, browser automation or posting.
import {planMagazineIssue} from './magazine-editorial.js';
import {buildWriterBrief,reviewArticle} from './magazine-writing-workflow.js';
export function createWriterHandoff(day,slot='19:30'){
 const issue=planMagazineIssue(day,slot);
 const brief=buildWriterBrief(issue);
 return {version:1,day,slot,topicId:issue.topicId,brief,
  prompt:['あなたは暮らしの雑誌「ラクミツ」の編集ライターです。','下記の企画を、読者と会話するように自然な日本語で書いてください。読み手が自分の生活を想像できる場面から、役立つ発見へつなげてください。','短文は80〜140字、中文は140〜300字、特集は300〜480字を目安に、500字以内。情報の深さに合わせ、無理に字数を増やさない。','商品名や仕様、実体験を創作しない。タイトルや結論、問いかけ、語尾を定型化しない。会話口調を演出するだけでなく、読者の疑問に答える。','原稿本文だけを返してください。URL・広告表記は別工程で追加します。',JSON.stringify(brief,null,2)].join('\n')};
}
export function reviewWriterHandoff(handoff,article){
 if(handoff?.version!==1||!handoff.topicId)return {status:'invalid_handoff',publicationAllowed:false};
 const review=reviewArticle(article);
 return {status:review.status,topicId:handoff.topicId,day:handoff.day,slot:handoff.slot,
  article:review.errors.length?null:article,review,publicationAllowed:false};
}
