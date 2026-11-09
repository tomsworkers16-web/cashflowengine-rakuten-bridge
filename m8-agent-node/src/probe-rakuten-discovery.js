// Rakuten discovery proof-of-concept: read-only ranking + genre inspection.
// No posting, no local persistence, no storage of raw API response.
// This module deliberately does not presume ranking = sales volume.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEditorialShortlist } from './editorial-shortlist.js';

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
  if(api==='genre'||Number(genreId)!==0)url.searchParams.set('genreId',String(genreId));
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
  // The API may return page entries in descending rank order. Sort the full
  // response BEFORE limiting; slicing the raw array returned ranks 30..21
  // rather than 1..10 in the 2026-11-10 M8 live probe.
  const entries=input.map(entry=>{
    const i=unwrap(entry);
    const number=Number(i?.rank);
    return {
      rank:Number.isInteger(number)&&number>0?number:null,
      itemCode:String(i?.itemCode??'').slice(0,120),
      itemName:String(i?.itemName??'').slice(0,100),
      genreId:i?.genreId??null,
      price:Number.isFinite(Number(i?.itemPrice))?Number(i.itemPrice):null,
      hasAffiliateUrl:typeof i?.affiliateUrl==='string'&&i.affiliateUrl.startsWith('https://')
    };
  });
  const ranked=entries.filter(i=>i.rank!==null).sort((a,b)=>a.rank-b.rank);
  return {
    asOf:json?.lastBuildDate??null,
    received:input.length,
    validRankCount:ranked.length,
    sampled:Math.min(max,ranked.length),
    items:ranked.slice(0,max)
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
      if(api==='ranking'){
        const all=rankingSummary(json,30);
        output.editorialShortlist=buildEditorialShortlist(all.items,{max:5});
      }
    }finally{clearTimeout(timer);}
    if(index<calls.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
  }
  return output;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const genreOption=process.argv.slice(2).find(arg=>arg.startsWith('--genre-id='));
  const genreId=genreOption?genreOption.slice('--genre-id='.length):0;
  runDiscoveryProbe({
    applicationId:process.env.RAKUTEN_APPLICATION_ID,
    accessKey:process.env.RAKUTEN_ACCESS_KEY,
    affiliateId:process.env.RAKUTEN_AFFILIATE_ID,
    genreId
  }).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    const message=String(error?.message??'');
    const safe=/^(?:rakuten_credentials_missing|unsupported_api|invalid_genre_id|invalid_period|unexpected_ranking_shape|unexpected_genre_shape|rakuten_(?:ranking|genre)_http_\d{3})$/.test(message)
      ?message:'discovery_probe_failed';
    console.error(JSON.stringify({status:'failed',reason:safe,postingPerformed:false}));
    process.exitCode=1;
  });
}
