// Read-only evidence triage for VAKUEN-like vacuum food containers.
// The product description may cover many sizes, pumps and bundles.
// Evidence matches do not establish which SKU/option is selected.
import {extractProductPageText} from './editorial-page-verifier.js';

const QUERIES=[
 {id:'pump_not_included',label:'単品購入時のポンプ付属条件',matches:['単品でご購入の場合、自動真空ポンプは付属しません','単品でご購入の場合、電動真空ポンプは付属しません']},
 {id:'microwave_limit',label:'電子レンジの時間・出力制限',matches:['500～600W・2分以内','500〜600W・2分以内','500～600Wで2分以内','500〜600Wで2分以内']},
 {id:'microwave_oil_warning',label:'油分の多い食品の加熱禁止',matches:['油分の多い食材のレンジ温めは破損の恐れがあるため絶対にお控えください','油分の多い食材は絶対にお控えください']},
 {id:'dishwasher_limit',label:'食洗機のモード制限',matches:['標準モードのみ使用可能です']},
 {id:'pump_washing_warning',label:'真空ポンプの水洗い禁止',matches:['真空ポンプ本体は水洗い不可']},
 {id:'liquid_limit',label:'液体の保存量制限',matches:['容量の80%以下','容量の８０％以下']},
 {id:'gas_food_warning',label:'ガスを出す食材への注意',matches:['ガスを多く排出する食材の真空保存は推奨しておりません']},
 {id:'temperature_limit',label:'使用温度の範囲',matches:['-30～100℃','-30〜100℃','-30℃～100℃','-30℃〜100℃']}
];
function getEvidence(text,item){
 for(const phrase of item.matches){
  const i=text.indexOf(phrase);
  if(i>=0)return {id:item.id,label:item.label,found:true,quote:phrase,
   excerpt:text.slice(Math.max(0,i-45),Math.min(text.length,i+phrase.length+90)).trim()};
 }
 return {id:item.id,label:item.label,found:false,quote:null,excerpt:null};
}
export function analyzeVacuumContainerPage(html){
 const text=extractProductPageText(html);
 const evidence=QUERIES.map(x=>getEvidence(text,x));
 const hits=new Set(evidence.filter(e=>e.found).map(e=>e.id));
 const required=['pump_not_included','microwave_limit','microwave_oil_warning','dishwasher_limit','pump_washing_warning','liquid_limit','gas_food_warning'];
 const missing=required.filter(x=>!hits.has(x));
 // Even complete page descriptions do not prove what is included in an
 // individual purchasable variation: don't automatically release an article.
 return {
  status:missing.length?'product_conditions_incomplete':'variant_review_required',
  mode:'read_only_no_publication',articleEligible:false,publishApproved:false,published:0,
  evidence,foundCount:evidence.filter(e=>e.found).length,missingRequired:missing,
  caveat:'Presence of a condition on the page does not prove it applies to the selected SKU or bundle. Check selected capacity, pump inclusion and exact option before editorial approval.'
 };
}
