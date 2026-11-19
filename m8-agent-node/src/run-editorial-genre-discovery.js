// Read-only category-first discovery for non-storage editorial validation.
// Fetch ranking+taxonomy in each category; never publish or emit credentials.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {runDiscoveryProbe} from './probe-rakuten-discovery.js';

const CATEGORIES=[
  {genreId:558944,name:'キッチン用品・食器・調理器具'},
  {genreId:215783,name:'日用品雑貨・文房具・手芸'}
];
const ELIGIBLE=new Set(['cleaning','kitchen_textiles','food_preservation','cooking','floor_protection','digital']);
export async function runEditorialGenreDiscovery({
  applicationId,accessKey,affiliateId,fetchFn=fetch,
  delayFn=ms=>new Promise(r=>setTimeout(r,ms))
}={}) {
  if(!applicationId||!accessKey)return {status:'research_required',reason:'rakuten_credentials_missing',published:0};
  const results=[];
  for(const category of CATEGORIES){
    try {
      const probe=await runDiscoveryProbe({applicationId,accessKey,affiliateId,
        genreId:category.genreId,enrich:false,fetchFn});
      const chosen=(probe.editorialShortlist?.selected??[])
        .filter(x=>ELIGIBLE.has(x.theme)&&x.itemCode.includes(':'))
        .slice(0,3)
        .map(x=>({itemCode:x.itemCode,theme:x.theme,itemName:x.itemName,
          rank:x.rank,price:x.price,priority:x.priority}));
      results.push({genreId:category.genreId,category:category.name,
        rankingAsOf:probe.results.ranking?.asOf??null,
        received:probe.results.ranking?.received??0,
        candidates:chosen});
    } catch {
      results.push({genreId:category.genreId,category:category.name,
        status:'research_required',reason:'genre_probe_failed',candidates:[]});
    }
    if(category!==CATEGORIES[CATEGORIES.length-1])await delayFn(1100);
  }
  const candidates=results.flatMap(x=>x.candidates);
  return {status:candidates.length?'candidates_found':'no_eligible_candidates',
    mode:'read_only_category_first',results,totalCandidates:candidates.length,
    published:0,postingPerformed:false,
    nextStep:'Inspect source pages for selected non-storage items before generating any article'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  runEditorialGenreDiscovery({applicationId:process.env.RAKUTEN_APPLICATION_ID,
    accessKey:process.env.RAKUTEN_ACCESS_KEY,
    affiliateId:process.env.RAKUTEN_AFFILIATE_ID})
    .then(r=>console.log(JSON.stringify(r,null,2)))
    .catch(()=>{console.error(JSON.stringify({status:'failed',reason:'genre_discovery_failed',published:0}));process.exitCode=1;});
}
