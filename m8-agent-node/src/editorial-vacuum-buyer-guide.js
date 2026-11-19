// Reader-first informational draft from strictly matched VAKUEN page cautions.
// This is not a SKU-specific recommendation or publication approval.
const required=[
 'pump_not_included','microwave_limit','microwave_oil_warning',
 'dishwasher_limit','pump_washing_warning','liquid_limit','gas_food_warning'
];
export function buildVacuumBuyerReviewDraft(review,{sourceUrl,checkedAt,sizeChart}={}){
 const validUrl=typeof sourceUrl==='string'&&/^https:\/\/item\.rakuten\.co\.jp\/[\w-]+\/[\w-]+\/$/u.test(sourceUrl);
 const validDate=typeof checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(checkedAt);
 const present=new Set((review?.evidence??[]).filter(e=>e.found===true&&
   typeof e.quote==='string'&&e.quote.length>=8).map(e=>e.id));
 if(!validUrl||!validDate||!required.every(x=>present.has(x)))
   return {status:'research_required',reason:'required_buyer_evidence_missing',reviewDraft:null,published:0};
 const sections=[
  '# 真空保存容器は「買ってすぐ使える」とは限らない｜購入前の3つの確認',
  '',
  '【未公開・商品選択肢の確認待ち】以下は楽天の商品説明から確認できた注意点を整理した編集用下書きです。個別の容量・セット内容・価格は未確認です。',
  '',
  '## 1. 容器単品に真空ポンプは付属する？',
  '商品ページは「単品でご購入の場合、自動真空ポンプは付属しません」と説明しています。真空保存を目的に購入するなら、選択するセットにポンプが含まれるか、購入画面で必ず確認しましょう。容量違いやセット違いを商品名だけで判断しないことが大切です。',
  '',
  '## 2. 電子レンジ・食洗機は無条件で使える？',
  '電子レンジの案内は500〜600W・2分以内の温めに限定されています。油分の多い食材をレンジで温めることは避けるよう明記されています。食洗機についても標準モードのみとされ、真空ポンプ本体は水洗いできません。容器とポンプを区別して取り扱いを確認してください。',
  '',
  '## 3. 液体や発酵食品にも使える？',
  '液体の保存は容量の80%以下という注意があります。また、ガスを多く排出する食材の真空保存は推奨されていません。保存したい食材を先に決めて、商品説明の制限に当てはまらないかを確認しましょう。',
  '',
  '## 購入前の最終チェック',
  '容器の容量／選んだセットのポンプ付属有無／加熱と洗浄の制限／保存したい食品との適合を、購入する選択肢の表示と照合してください。一つでも不明な点があれば、確認できるまで購入判断を保留するのが安全です。',
  '',
  '## 根拠と注意',
  '出典：'+sourceUrl,
  'ページ記載の確認日：'+checkedAt,
  'この文章は販売ページの注意事項を整理したもので、実使用や選択済みSKUの適合を検証したものではありません。使用時は最新の商品説明を確認してください。'
 ];
 if(sizeChart?.status==='size_chart_extracted'&&sizeChart.variants?.length>=5){
  const bySeries=new Map();
  for(const v of sizeChart.variants){
   if(!bySeries.has(v.series))bySeries.set(v.series,[]);
   bySeries.get(v.series).push(v.capacityLiters+'L（'+v.widthMm+'×'+v.depthMm+'×'+v.heightMm+'mm）');
  }
  const at=sections.indexOf('## 購入前の最終チェック');
  sections.splice(at,0,
   '## 参考：販売ページにある容量・外寸の一覧',
   '販売ページには複数の種類が掲載されています。下記は製品説明上の容量と外寸であり、今選べる販売オプションやセット内容を保証するものではありません。',
   ...[...bySeries].map(([name,items])=>'- '+name+'：'+items.join('／')),
   '');
 }
 return {
  status:'editorial_review_draft',
  reviewDraft:sections.join('\n'),
  evidenceIds:required,
  articleEligible:false,publishApproved:false,published:0,
  pending:['selected_variant_capacity','selected_bundle_pump_inclusion','final_editorial_review']
 };
}
