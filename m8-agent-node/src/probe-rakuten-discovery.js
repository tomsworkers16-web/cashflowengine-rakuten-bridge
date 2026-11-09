// Rakuten discovery proof-of-concept: read-only ranking + genre inspection.
// No posting, no local persistence, no storage of raw API response.
// This module deliberately does not presume ranking = sales volume.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT='https://openapi.rakuten.co.jp';
export const ENDPOINTS={
  ranking:ROOT+'/ichibaranking/api/IchibaItem/Ranking/20220601',
  genre:ROOT+'/ichibagt/api/IchibaGenre/Search/20260701'
};

export function makeRequest(api,{applicationId,accessKey,affiliateId,genreId=0,period=''}={}){
  if(!applicationId||!accessKey)throw new Error('rakuten_credentials_missing');
  if(!Object.hasOwn(ENDPOINTS,api))throw new Error('unsupported_api');
  if(!Number.isInteger(Number(genreId))||Number(genreId)<0||Number(genreId)>9999999)throw new Error('invalid_genre_id');
  if(period&&!['realtime','daily','weekly'].includes(period))throw new Error('invalid_period');
  const url=new URL(ENDPOINTS[api]);
  url.searchParams.set('applicationId',String(applicationId));
  url.searchParams.set('format','json');
  url.searchParams.set('formatVersion','2');
  url.searchParams.set('genreId',String(genreId));
  if(api==='ranking'){
    url.searchParams.set('page','1');
    if(period)url.searchParams.set('period',period);
    if(affiliateId)url.searchParams.set('affiliateId',String(affiliateId));
  }
  return {url,headers:{accessKey:String(accessKey)}};
}

const unwrap=x=>x?.Item??x?.item??x;
const genreObj=x=>x?.genre??x?.Genre??x;
export function rankingSummary(json,max=10){
  const input=json?.Items??json?.items;
  if(!Array.isArray(input))throw new Error('unexpected_ranking_shape');
  return {
    asOf:json?.lastBuildDate??null,
    sampled:Math.min(max,input.length),
    items:input.slice(0,max).map(entry=>{
      const i=unwrap(entry);
      return {
        rank:Number.isFinite(Number(i?.rank))?Number(i.rank):null,
        itemCode:String(i?.itemCode??'').slice(0,120),
        itemName:String(i?.itemName??'').slice(0,100),
        genreId:i?.genreId??null,
        price:Number.isFinite(Number(i?.itemPrice))?Number(i.itemPrice):null,
        hasAffiliateUrl:typeof i?.affiliateUrl==='string'&&i.affiliateUrl.startsWith('https://')
      };
    })
  };
}

export function genreSummary(json,max=40){
  const current=genreObj(json?.genre);
  const input=json?.children??json?.Children;
  if(!Array.isArray(input))throw new Error('unexpected_genre_shape');
  return {
    genreId:current?.genreId??null,
    genreName:current?.nameJa??null,
    children:input.slice(0,max).map(entry=>{
      const g=genreObj(entry);
      return {genreId:g?.genreId??null,name:g?.nameJa??null,level:g?.level??null};
    }),
    totalChildren:input.length
  };
}

export async function runDiscoveryProbe({
  applicationId,accessKey,affiliateId,genreId=0,fetchFn=fetch
}={}){
  const calls=[['genre',{}],['ranking',{}]];
  const output={status:'read_only',postingPerformed:false,persistencePerformed:false,
    rankingMeans:'relative popularity, not verified unit sales',
    results:{}};
  for(let index=0;index<calls.length;index++){
    const [api,extra]=calls[index];
    const req=makeRequest(api,{applicationId,accessKey,affiliateId,genreId,...extra});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetchFn(req.url,{headers:req.headers,signal:controller.signal,redirect:'error'});
      if(!response.ok)throw new Error('rakuten_'+api+'_http_'+response.status);
      const json=await response.json();
      output.results[api]=api==='genre'?genreSummary(json):rankingSummary(json);
    }finally{clearTimeout(timer);}
    if(index<calls.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
  }
  return output;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runDiscoveryProbe({
    applicationId:process.env.RAKUTEN_APPLICATION_ID,
    accessKey:process.env.RAKUTEN_ACCESS_KEY,
    affiliateId:process.env.RAKUTEN_AFFILIATE_ID
  }).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    const message=String(error?.message??'');
    const safe=/^(?:rakuten_credentials_missing|unsupported_api|invalid_genre_id|invalid_period|unexpected_ranking_shape|unexpected_genre_shape|rakuten_(?:ranking|genre)_http_\d{3})$/.test(message)
      ?message:'discovery_probe_failed';
    console.error(JSON.stringify({status:'failed',reason:safe,postingPerformed:false}));
    process.exitCode=1;
  });
}
