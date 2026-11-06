// Exploratory attention comparison for affiliate copy hypotheses.
// Post impressions are NOT affiliate clicks or attributable commissions.
export function summarizeRevenueCopyVariants(publishedPosts=[],postInsights=[]) {
 const viewsById=new Map((Array.isArray(postInsights)?postInsights:[])
  .filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x.metrics?.views]));
 const groups=new Map();
 for(const p of Array.isArray(publishedPosts)?publishedPosts:[]){
  if(p?.meta?.role!=='revenue'||typeof p.id!=='string')continue;
  const variant=String(p.meta.copyVariant||'unlabeled');
  if(!groups.has(variant))groups.set(variant,{variant,posts:0,postsWithViews:0,
   totalViews:0,missingViews:0});
  const g=groups.get(variant);
  g.posts++;
  const views=viewsById.get(p.id);
  if(Number.isFinite(views)&&views>=0){g.totalViews+=views;g.postsWithViews++;}
  else g.missingViews++;
 }
 const variants=[...groups.values()].sort((a,b)=>a.variant.localeCompare(b.variant))
  .map(g=>({...g,averageViewsPerMeasuredPost:g.postsWithViews?
   Math.round(g.totalViews/g.postsWithViews*10)/10:'unknown'}));
 const comparable=variants.filter(v=>v.variant!=='unlabeled'&&v.postsWithViews>=3).length>=2;
 return {
  variants,
  exploratoryComparisonReady:comparable,
  automatedWinnerSelection:false,
  decision:comparable?'view_comparison_only':'insufficient_comparable_view_data',
  caveat:'投稿表示数だけではクリック率・成果報酬・因果関係を証明できません。楽天日別報告は投稿別帰属ではありません。'
 };
}
