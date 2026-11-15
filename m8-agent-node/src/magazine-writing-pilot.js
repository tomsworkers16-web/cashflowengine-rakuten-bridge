// Provider-neutral, offline-testable writer/reviewer orchestration. No publication or network by default.
import {buildEditorialPacket} from './magazine-editorial-packet.js';
import {reviewArticle} from './magazine-writing-workflow.js';
import {prepareMagazineCommercialDraft} from './magazine-commercial-draft.js';
export async function runMagazineWritingPilot(snapshot,{writer,reviewer}={}){
 const packet=await buildEditorialPacket(snapshot);
 if(typeof writer!=='function'||typeof reviewer!=='function')return {status:'provider_not_configured',entries:[],publicationAllowed:false};
 const entries=[];
 for(const entry of packet.entries){
  const {strategy,itemCode,product,brief}=entry;
  const base={strategy,itemCode};
  try{
   const linkLength=String(product.affiliateUrl||'').length;
   const maxBody=Math.max(0,500-linkLength-130);
   if(maxBody<40){entries.push({...base,status:'link_budget_too_small'});continue;}
   const article=await writer({...brief,itemCode,strategy,maxBodyCharacters:maxBody});
   const structural=reviewArticle(article);
   if(structural.errors.length||typeof article!=='string'||article.length>maxBody){entries.push({...base,status:'writer_output_rejected',structural});continue;}
   const editorial=await reviewer({brief,article,itemCode});
   if(editorial?.decision!=='accept'||editorial.itemCode!==itemCode){entries.push({...base,status:'editorial_revision_required'});continue;}
   const draft=prepareMagazineCommercialDraft({article,product});
   entries.push({...base,status:draft.status,draft});
  }catch{entries.push({...base,status:'writer_or_reviewer_failed'});}
 }
 return {status:entries.length>0&&entries.every(e=>e.status==='manual_review_required')?'drafts_ready_for_manual_review':'drafts_need_work',entries,publicationAllowed:false};
}
