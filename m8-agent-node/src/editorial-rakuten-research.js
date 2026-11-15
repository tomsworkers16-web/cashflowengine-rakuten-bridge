// Read-only editorial research packet from existing Rakuten official discovery.
// No persistence, outbound posts, or exposed credentials. Runs only when invoked.
import { runDiscoveryProbe } from './probe-rakuten-discovery.js';
import { fetchRakutenEditorialEvidence } from './editorial-rakuten-evidence.js';

export async function runEditorialRakutenResearch({
  applicationId,accessKey,affiliateId,fetchFn=fetch,max=3,
  delayFn=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  if(!Number.isInteger(max)||max<1||max>3)throw new Error('invalid_editorial_research_max');
  const discovery=await runDiscoveryProbe({
    applicationId,accessKey,affiliateId,fetchFn,enrich:false
  });
  const candidates=(discovery.editorialShortlist?.selected??[]).slice(0,max);
  const apiEvidenceByItemCode={};
  const held=[];
  for (let i=0;i<candidates.length;i++) {
    const candidate=candidates[i];
    if(i)await delayFn(1100);
    try {
      const evidence=await fetchRakutenEditorialEvidence(candidate.itemCode,{
        applicationId,accessKey,affiliateId,fetchFn
      });
      apiEvidenceByItemCode[candidate.itemCode]=evidence;
    } catch (error) {
      const code=String(error?.message||'');
      // Never serialize HTTP request, credentials or arbitrary upstream errors.
      held.push({itemCode:candidate.itemCode,reason:/^rakuten_item_http_\d{3}$/.test(code)?
        code:'rakuten_product_research_failed'});
    }
  }
  return {
    version:'rakuten-editorial-research-v1',mode:'read_only_no_publication',
    ranking:discovery.results?.ranking?.items??[],
    candidates,
    apiEvidenceByItemCode,
    held,
    counts:{candidates:candidates.length,researched:Object.keys(apiEvidenceByItemCode).length,
      held:held.length,reviewCandidates:0,published:0},
    nextStep:'商品ページで仕様・設置条件等の根拠を確認してから記事制作に進む。ランキング/商品APIのみでは記事公開候補にしない'
  };
}
