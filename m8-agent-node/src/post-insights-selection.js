// Refresh selected recent revenue posts after their publication day.
// Posts can accumulate views for several days; daily-only snapshots bias tests.
export function selectPostsForInsights(published, targetDay, {maxPosts=8,lookbackDays=7}={}){
 const target=Date.parse(targetDay+'T00:00:00+09:00');
 if(!Number.isFinite(target)||!/^\d{4}-\d{2}-\d{2}$/.test(targetDay))
  throw Error('invalid_report_day');
 const valid=Array.isArray(published)?published:[];
 const newest=new Map();
 for(const post of valid){
  const id=String(post?.id||'');
  const date=String(post?.jstDate||'');
  if(!/^\d+$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  const age=(target-Date.parse(date+'T00:00:00+09:00'))/86400000;
  if(!Number.isInteger(age)||age<0||age>=lookbackDays)continue;
  newest.set(id,post);
 }
 const entries=[...newest.values()];
 const current=entries.filter(p=>p.jstDate===targetDay)
   .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
 const historical=entries.filter(p=>p.jstDate!==targetDay&&p.meta?.role==='revenue')
   .sort((a,b)=>String(b.jstDate).localeCompare(String(a.jstDate))||
     String(b.at||'').localeCompare(String(a.at||'')));
 // Revenue attribution remains unknown, but experiment coverage should
 // not be starved by today's non-commercial posts under the API call cap.
 const currentRevenue=current.filter(p=>p.meta?.role==='revenue');
 const currentOther=current.filter(p=>p.meta?.role!=='revenue');
 return [...currentRevenue,...historical,...currentOther]
   .slice(0,Math.max(0,Math.min(12,maxPosts)));
}
