// Magazine-first editorial pilot: curated evergreen briefs, no invented reviews.
// Pure preview only; no publishing, network, credentials or runtime changes.
import {validatePublicationText} from './product-posting.js';
const briefs=[
 {id:'storage-flow',series:'暮らしの小さな発見',keyword:'収納 ラック',title:'収納を買う前に、置き場所より動線を考える',short:'収納用品を買う前に、一度だけ確認したいこと。よく使う物を取るために、別の物をどかしていませんか？まずは毎日使う物を手前に置くだけでも、暮らしが少し変わるかもしれません。',article:'片付けても、なぜかすぐ散らかる。そんなときは収納の量より、物を出して戻すまでの動きに目を向けてみたい。\n\n例えば、毎朝使う道具を棚の奥にしまうと、取り出すたびに手前の物を動かすことになります。戻すのもひと手間。\n\nまずは、よく使う物を一つ選んで手前に移してみる。棚の高さや奥行きに余裕があるかも確認する。\n\nそれでも置き場所が足りないと分かったら、新しい収納用品を探す。順番を変えるだけで、必要な道具が見えてきます。'},
 {id:'washbasin',series:'そのひと手間、減らせませんか？',keyword:'洗面台 ヘアーキャッチャー 排水口',title:'洗面台のゴミ受けは、掃除するところまで考えて選ぶ',short:'洗面台のゴミ受けを選ぶとき、髪の毛を拾えるかだけでなく、捨てるときのことも考えたい。まずは排水口の形とサイズを確認。毎日使う場所だから、手入れのしやすさも大切です。',article:'洗面台の排水口を掃除するとき、髪の毛を取り除くのはちょっとした手間。ゴミ受けを買い替えるなら、見た目や価格だけで決める前に、使い終わった後のことを想像してみたい。\n\nまず、今の排水口の直径と形状を確認。商品によって対応する寸法が違うので、写真だけで選ばず、メーカーの適合条件を見ておく。\n\n次に、髪の毛をどう取り除くか。ゴミ受け自体をどう洗うか。毎日の掃除を思い浮かべると、自分に合う形が見えてきます。\n\n今のゴミ受けで困っていないなら、買い替えなくてもいい。道具を変えるのは、不便の理由が分かってからで十分です。'},
 {id:'kitchen-cleanup',series:'失敗しない道具選び',keyword:'水切り ラック',title:'キッチン用品は、使った後のことも考える',short:'便利なキッチン用品を見つけたら、使う場面だけでなく洗う場面も想像してみる。洗いやすいか、乾かす場所はあるか。使う時間と片付ける時間、両方で選びたいですね。',article:'料理道具を選ぶとき、つい調理中の便利さに目が向きます。でも、毎日の暮らしでは、使った後の片付けも同じくらい大事。\n\n例えば水切りラックなら、食器が置ける量だけでなく、台所に置いたときの幅や、水が流れる方向を確認したい。シンクの形や置き場所に合っているか、商品ページの寸法図で確かめる。\n\nさらに、ラック自体を洗うときに分解できるか、手が届くかも確認しておくといい。\n\n道具の便利さは、一度使ったときだけでは分からない。準備から片付けまでの流れで考えると、買う理由も買わない理由も整理できます。'}
];
export function planMagazineIssue(day,slot='19:30'){
 const n=Date.parse(String(day)+'T00:00:00Z')/86400000;
 if(!Number.isInteger(n))throw Error('invalid_issue_date');
 const brief=briefs[((n%briefs.length)+briefs.length)%briefs.length];
 const format=slot==='07:30'?'short':slot==='19:30'?'feature':'short';
 const body=format==='feature'?brief.article:brief.short;
 const text=format==='feature'?brief.title+'\n\n'+body:body;
 if(validatePublicationText(text))throw Error('invalid_editorial_preview');
 return {status:'preview_only',day,slot,series:brief.series,topicId:brief.id,title:brief.title,format,
  text,characters:text.length,researchKeyword:brief.keyword,productSelection:'not_performed',
  evidence:'curated_general_advice; no product performance or first-hand use claims'};
}
