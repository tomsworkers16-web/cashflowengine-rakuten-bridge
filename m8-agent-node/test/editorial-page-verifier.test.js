import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchRakutenProductPageHtml,verifyProductPageQuotes,extractProductPageText,decodeProductPageHtml}
  from '../src/editorial-page-verifier.js';
import {runEditorialPageVerifiedWorkflow} from '../src/editorial-page-verified-workflow.js';
import {rakutenEditorialEvidence} from '../src/editorial-rakuten-evidence.js';

const productUrl='https://item.rakuten.co.jp/e-kurashi/s1u57/';
const candidate={itemCode:'e-kurashi:10048736',itemName:'壁付き チェスト 収納',rank:24,price:4999,hasAffiliateUrl:true};
const evidence=rakutenEditorialEvidence({Items:[{Item:{
 itemCode:candidate.itemCode,itemName:candidate.itemName,itemPrice:4999,
 itemUrl:'https://hb.afl.rakuten.co.jp/hgc/mock/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fe-kurashi%2Fs1u57%2F',
 affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/mock/'
}}]},candidate.itemCode,{checkedAt:'2026-11-20'});
const html='<html><head><style>.x{display:none}</style></head><body>'+
 '<div>幅34cm 奥行41.5cm 高さ66.1cm</div><p>材質：ポリプロピレン</p>'+
 '<p>耐荷重 引き出し1段 約2kg</p>'+
 '<script>悪意ある文章 幅99cm</script></body></html>';
const plans=[
 {id:'width',claim:'幅34cmの表示',quote:'幅34cm 奥行41.5cm'},
 {id:'material',claim:'材質はポリプロピレンと表示',quote:'材質：ポリプロピレン'}
];
const model=()=>({title:'チェストを買う前に',reader:{problem:'引き出しが開けられるか心配',context:'狭い部屋'},
 purchaseChecks:[{risk:'設置スペース不足',howToCheck:'前後も測る'},
 {risk:'内寸が合わない',howToCheck:'収納物を測る'},
 {risk:'掃除がしづらい',howToCheck:'脚の形状を確認する'}],
 comparisonMethod:'外寸・内寸・清掃のしやすさを比べる',
 goodFor:'寸法が合う人',notGoodFor:'寸法が合わない人'});
test('visible quote matches; script and CSS content ignored',()=>{
 const result=verifyProductPageQuotes({apiEvidence:evidence,pageUrl:productUrl,html,quotePlans:plans,checkedAt:'2026-11-20'});
 assert.equal(result.status,'page_quotes_matched');
 assert.equal(result.pageReview.specs.length,2);
 assert.doesNotMatch(extractProductPageText(html),/悪意ある文章/);
});
test('missing literal quote fails closed',()=>{
 const r=verifyProductPageQuotes({apiEvidence:evidence,pageUrl:productUrl,html,
  quotePlans:[plans[0],{id:'fake',claim:'未確認',quote:'幅99cmと書いてある'}],checkedAt:'2026-11-20'});
 assert.equal(r.status,'research_required');
});
test('wrong item page and too short snippet fail closed',()=>{
 const x=verifyProductPageQuotes({apiEvidence:evidence,pageUrl:'https://item.rakuten.co.jp/other/other/',html,quotePlans:plans,checkedAt:'2026-11-20'});
 assert.equal(x.reason,'product_page_url_mismatch');
 const y=verifyProductPageQuotes({apiEvidence:evidence,pageUrl:productUrl,html,
  quotePlans:[plans[0],{id:'tiny',claim:'短すぎ',quote:'cm'}],checkedAt:'2026-11-20'});
 assert.equal(y.status,'research_required');
});
test('live fetch does not follow redirects or accept external hosts',async()=>{
 let urlSeen, optsSeen;
 const result=await fetchRakutenProductPageHtml(productUrl,{fetchFn:async(url,opts)=>{
   urlSeen=url;optsSeen=opts;
   return {ok:true,status:200,headers:{get:key=>key==='content-type'?'text/html; charset=utf-8':null},
    arrayBuffer:async()=>Buffer.from(html,'utf8')};
 }});
 assert.equal(urlSeen,productUrl);
 assert.equal(optsSeen.redirect,'manual');
 assert.equal(result.html,html);
 await assert.rejects(()=>fetchRakutenProductPageHtml('https://evil.example/',{fetchFn:async()=>{throw Error('called');}}),
 /unsupported_product_page_url/);
});
test('complete snapshot to AI review-only article; no publishing',async()=>{
 const r=await runEditorialPageVerifiedWorkflow({
  ranking:[candidate],apiEvidenceByItemCode:{[candidate.itemCode]:evidence},
  pageHtmlByItemCode:{[candidate.itemCode]:html},
  quotePlansByItemCode:{[candidate.itemCode]:plans},
  generateFn:async()=>model(),checkedAt:'2026-11-20'
 });
 assert.equal(r.pageVerification[0].status,'page_quotes_matched');
 assert.equal(r.summary.reviewCandidates,1);
 assert.equal(r.summary.published,0);
 assert.equal(r.publishApproved,false);
 assert.match(r.entries[0].article,/【PR】/);
});
test('no text evidence cannot produce article',async()=>{
 const r=await runEditorialPageVerifiedWorkflow({
  ranking:[candidate],apiEvidenceByItemCode:{[candidate.itemCode]:evidence},
  quotePlansByItemCode:{[candidate.itemCode]:plans},
  generateFn:async()=>model(),checkedAt:'2026-11-20'
 });
 assert.equal(r.summary.reviewCandidates,0);
 assert.equal(r.pageVerification[0].status,'research_required');
});

test('decodes legacy EUC-JP HTML using meta charset without mangling Japanese',()=>{
 const raw=Buffer.from('3c68746d6c3e3c686561643e3c6d65746120636861727365743d224555432d4a50223e3c2f686561643e3c626f64793ea5b3a5edb5d320a5c1a5a7a5b9a5c820c9fd3334636d20bae0bcc1a1a7a5dda5eaa5d7a5eda5d4a5eca5f33c2f626f64793e','hex');
 const decoded=decodeProductPageHtml(raw,'text/html');
 assert.match(decoded,/コロ脚 チェスト 幅34cm/);
 assert.match(decoded,/材質：ポリプロピレン/);
 assert.equal(extractProductPageText(decoded).includes('ポリプロピレン'),true);
});
test('legacy charset is supported in fetched binary response',async()=>{
 const raw=Buffer.from('3c68746d6c3e3c686561643e3c6d65746120636861727365743d224555432d4a50223e3c2f686561643e3c626f64793ea5b3a5edb5d320a5c1a5a7a5b9a5c820c9fd3334636d20bae0bcc1a1a7a5dda5eaa5d7a5eda5d4a5eca5f33c2f626f64793e','hex');
 const r=await fetchRakutenProductPageHtml(productUrl,{fetchFn:async()=>({
  ok:true,status:200,headers:{get:k=>k==='content-type'?'text/html; charset=EUC-JP':null},
  arrayBuffer:async()=>raw
 })});
 assert.match(r.html,/ポリプロピレン/);
});
test('unsupported or mismatched declared charset stops verification',()=>{
 assert.throws(()=>decodeProductPageHtml(Buffer.from([255,255,255]),'text/html; charset=utf-8'),/product_page_charset_invalid/);
});
