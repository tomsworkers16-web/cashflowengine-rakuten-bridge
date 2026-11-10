// Opt-in, bounded copy experiment. Default preserves the existing copy exactly.
import {revenueText,revenueCopyVariant,cleanProductName,productUseCase,validatePublicationText} from './product-posting.js';
import {auditDraft} from './threads-copy-lab.js';
export function readerFirstQuestion(item){
 const name=cleanProductName(item?.itemName,110);
 if(/(?:洗面台|洗面所)/u.test(name)&&/(?:排水口|ヘアーキャッチャー|ゴミ受け)/u.test(name))return '洗面台の排水口、髪の毛の掃除が気になりませんか？';
 if(/(?:レンジフード|換気扇)/u.test(name)&&/フィルター/u.test(name))return '換気扇のフィルター、交換するときにサイズで迷いませんか？';
 if(/(?:収納|ラック|棚)/u.test(name))return '収納を増やしたいけれど、置き場所が足りないことありませんか？';
 if(/(?:包丁|ナイフ)/u.test(name)&&/(?:スタンド|ホルダー)/u.test(name))return '包丁の置き場所、使いやすさと収納スペースで迷いませんか？';
 return null;
}
export function buildRevenueCopy(item,day,{enabled=false}={}){
 const baseline=revenueCopyVariant(day);
 const fallback=()=>({text:revenueText(item,baseline),copyVariant:baseline,experiment:'legacy'});
 // Alternate by date, preserving the existing even-day control.
 if(enabled!==true||baseline==='compare_before_buy')return fallback();
 const question=readerFirstQuestion(item),url=String(item?.affiliateUrl||'');
 const name=cleanProductName(item?.itemName,44);
 if(!question||!name||!/^https:\/\//.test(url))return fallback();
 const price=Number(item.price);
 const priceLine=Number.isFinite(price)&&price>0?'掲載時の価格：約'+price.toLocaleString('ja-JP')+'円（変動あり）':'';
 const text=['【PR】',question,'「'+name+'」',productUseCase(item),priceLine,
  'サイズ・仕様・送料は商品ページで確認してください。',url].filter(Boolean).join('\n');
 if(validatePublicationText(text,{affiliateUrl:url,revenue:true})||
  !auditDraft(text,{affiliateUrl:url,revenue:true}).eligibleForManualReview)return fallback();
 return {text,copyVariant:'reader_problem_question_v1',experiment:'reader_first_v1'};
}
