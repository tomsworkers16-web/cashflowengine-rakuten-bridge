// Optional offline end-to-end orchestrator: shortlist -> sourced research -> model
// -> quality gate -> Markdown review candidate. No publishing or network by itself.
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { buildEditorialArticleWorkflow } from './editorial-article-workflow.js';
import { assembleEditorialResearch } from './editorial-rakuten-evidence.js';
import { draftArticleWithModel } from './editorial-llm-adapter.js';

export async function runEditorialAiWorkflow({
  ranking, researchByItemCode={},apiEvidenceByItemCode={},
  productPageReviewsByItemCode={},generateFn,max=5,performanceRecords,minClicks=5
}={}) {
  const shortlist=buildEditorialShortlist(ranking,{max,performanceRecords,minClicks});
  const draftsByItemCode={};
  const research={};
  const generation=[];
  for (const candidate of shortlist.selected) {
    let packet=researchByItemCode[candidate.itemCode];
    if (!packet && apiEvidenceByItemCode[candidate.itemCode]) {
      const assembled=assembleEditorialResearch(candidate,apiEvidenceByItemCode[candidate.itemCode],
        productPageReviewsByItemCode[candidate.itemCode]);
      packet=assembled.research;
      if (!packet) {
        generation.push({itemCode:candidate.itemCode,status:'research_required',reason:assembled.reason});
        continue;
      }
    }
    if (!packet) {
      generation.push({itemCode:candidate.itemCode,status:'research_required',reason:'missing_research'});
      continue;
    }
    research[candidate.itemCode]=packet;
    const result=await draftArticleWithModel(candidate,packet,{generateFn,limit:2});
    generation.push({itemCode:candidate.itemCode,status:result.status,attempt:result.attempt??null,
      feedback:result.feedback??null});
    if (result.status==='review_candidate') draftsByItemCode[candidate.itemCode]=result.draft;
  }
  // Do not silently swap a failed LLM draft for generic prose. Only qualified
  // model drafts should reach the article builder in this flow.
  const rendered=buildEditorialArticleWorkflow({
    ranking,
    draftsByItemCode,
    max,
    performanceRecords,minClicks,
    autoRevise:false
  });
  const allowed=new Set(Object.keys(draftsByItemCode));
  return {...rendered,
    mode:'ai_draft_offline_review_only',
    entries:rendered.entries.map(entry=>allowed.has(entry.itemCode)?entry:{
      ...entry,status:generation.find(g=>g.itemCode===entry.itemCode)?.status||'research_required',
      article:null,publishApproved:false
    }),
    generation,
    summary:{researchRequired:generation.filter(x=>x.status==='research_required').length,
      revisionRequired:generation.filter(x=>x.status==='revision_required').length,
      modelNotConnected:generation.filter(x=>x.status==='model_not_connected').length,
      reviewCandidates:rendered.entries.filter(x=>x.status==='review_candidate').length,
      published:0}
  };
}
