// Opportunity discovery MVP: search all three editorial lanes before choosing a topic.
// Scores are heuristic proxies, not sales, demand forecasts or profit estimates.
import {planMagazineIssue} from './magazine-editorial.js';
import {seasonalMagazineIssues} from './magazine-seasonal-lanes.js';
import {matchEditorialProducts} from './magazine-product-preview.js';
// Price bands are experimental purchase-friction proxies, not measured conversion rates.
export function turnoverProxy(price,reviewProxy,ratingProxy){
 const affordability=price<=3000?30:price<=5000?20:price<=10000?10:0;
 return affordability+reviewProxy+ratingProxy;
}
export async function discoverRevenueOpportunity(day,slot,{search,history=[],includeSeasonal=false}={}){
 if(typeof search!=='function')throw Error('search_adapter_required');
 const base=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(base))throw Error('invalid_issue_date');
 const opportunities=[];
 const issues=Array.from({length:3},(_,i)=>planMagazineIssue(new Date(base+i*86400000).toISOString().slice(0,10),slot));
 if(includeSeasonal)issues.push(...seasonalMagazineIssues(day,slot));
 for(const issue of issues){
  // Stop the entire scan on error, including 429; do not rank partial market results.
  const items=await search(issue.researchKeyword);
  const matches=matchEditorialProducts(issue,items);
  const unique=[...new Map(matches.filter(x=>x.price>0).map(x=>[x.itemCode,x])).values()];
  const scored=unique.map(candidate=>{
   const raw=items.find(x=>x.itemCode===candidate.itemCode);
   const numeric=v=>v===null||v===undefined||v===''?NaN:Number(v);
   const reviews=numeric(raw.reviewCount),rating=numeric(raw.reviewAverage);
   const rate=numeric(raw.affiliateRate);
   const reviewProxy=Number.isFinite(reviews)&&reviews>0?Math.min(30,Math.log10(1+reviews)*10):0;
   const ratingProxy=Number.isFinite(rating)&&rating>=4&&rating<=5?10:0;
   const rewardEstimate=Number.isFinite(rate)&&rate>0&&rate<=100?Math.floor(candidate.price*rate/100):null;
   return {...candidate,reviewCount:Number.isFinite(reviews)&&reviews>=0?reviews:null,
    reviewAverage:Number.isFinite(rating)&&rating>=0&&rating<=5?rating:null,affiliateRate:rewardEstimate===null?null:rate,
    indicativeReward:rewardEstimate,turnoverScore:turnoverProxy(candidate.price,reviewProxy,ratingProxy),score:reviewProxy+ratingProxy+(rewardEstimate===null?0:Math.min(30,rewardEstimate/10))};
  }).sort((a,b)=>b.score-a.score);
  const repeats=history.filter(x=>x?.day<day&&x.topicId===issue.topicId).slice(0,3).length;
  opportunities.push({topicId:issue.topicId,keyword:issue.researchKeyword,title:issue.title,issue:{...issue,day},candidateCount:scored.length,
   product:scored[0]||null,turnoverProduct:[...scored].sort((a,b)=>b.turnoverScore-a.turnoverScore)[0]||null,score:scored.length?scored[0].score+Math.min(10,scored.length)-repeats*5:null});
 }
 const ranked=opportunities.filter(x=>x.product).sort((a,b)=>b.score-a.score);
 const turnover=[...ranked].sort((a,b)=>b.turnoverProduct.turnoverScore-a.turnoverProduct.turnoverScore)[0]||null;
 return {strategyCandidates:{rewardOriented:ranked[0]||null,turnoverOriented:turnover?{topicId:turnover.topicId,title:turnover.title,product:turnover.turnoverProduct}:null},turnoverEvidence:'price_band_and_review_proxy_not_measured_conversion',status:ranked.length?'opportunity_preview':'no_eligible_product',selected:ranked[0]||null,opportunities,
  evidence:'listing_review_and_reward_proxies_not_sales',publicationAllowed:false};
}
