// Explicit, read-only run: npm run editorial-rakuten-research
import {runEditorialRakutenResearch} from './editorial-rakuten-research.js';
runEditorialRakutenResearch({
  applicationId:process.env.RAKUTEN_APPLICATION_ID,
  accessKey:process.env.RAKUTEN_ACCESS_KEY,
  affiliateId:process.env.RAKUTEN_AFFILIATE_ID,
  max:2
}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
  const code=String(error?.message||'');
  // Prevent leaking API keys, request URLs, or upstream response text.
  const safe=/^(?:rakuten_credentials_missing|unexpected_ranking_shape|unexpected_genre_shape|invalid_editorial_research_max|rakuten_(?:ranking|genre)_http_\d{3})$/.test(code)?code:'editorial_research_failed';
  console.error(JSON.stringify({status:'failed',reason:safe,published:0}));
  process.exitCode=1;
});
