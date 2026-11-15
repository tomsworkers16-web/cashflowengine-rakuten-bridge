// Official Ranking API, read-only. One page, no retries, no credential logging.
export function createRakutenRankingSearch({env=process.env,fetchImpl=fetch}={}){
 return async ({genreId,period='default'}={})=>{
  const {RAKUTEN_APPLICATION_ID:applicationId,RAKUTEN_ACCESS_KEY:accessKey}=env;
  if(!applicationId||!accessKey)throw Error('rakuten_credentials_missing');
  if(genreId!=null&&!/^\d+$/.test(String(genreId)))throw Error('invalid_genre');
  if(!['default','realtime'].includes(period))throw Error('invalid_period');
  const q=new URLSearchParams({applicationId,format:'json',formatVersion:'2',page:'1'});
  if(genreId!=null)q.set('genreId',String(genreId));
  if(period==='realtime')q.set('period',period);
  let response;
  try{response=await fetchImpl('https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601?'+q,{headers:{accessKey},signal:AbortSignal.timeout(15000)});}
  catch{throw Error('ranking_unavailable');}
  if(!response.ok)throw Error('ranking_http_'+response.status);
  let data;try{data=await response.json();}catch{throw Error('ranking_invalid_json');}
  const rows=data.Items||data.items;
  if(!Array.isArray(rows))throw Error('ranking_invalid_shape');
  return {scope:{genreId:genreId==null?null:String(genreId),period,page:1},lastBuildDate:data.lastBuildDate||null,
   items:rows.map(row=>row?.Item||row?.item||row).filter(i=>i&&typeof i.itemCode==='string'&&Number.isInteger(Number(i.rank))&&Number(i.rank)>0).map(i=>({itemCode:i.itemCode,rank:Number(i.rank)}))};
 };
}
export function attachRankingEvidence(result,snapshot){
 const ranks=new Map(snapshot.items.map(i=>[i.itemCode,i.rank]));
 const opportunities=result.opportunities.map(o=>({...o,rankingEvidence:o.product?{rank:ranks.get(o.product.itemCode)??null,scope:snapshot.scope,lastBuildDate:snapshot.lastBuildDate,meaning:ranks.has(o.product.itemCode)?'observed_in_ranking':'not_observed_in_sample'}:null}));
 // Do not rerank using an incomplete cross-category sample.
 return {...result,opportunities,selected:opportunities.find(o=>o.topicId===result.selected?.topicId)||null,rankingUsedForScore:false};
}
