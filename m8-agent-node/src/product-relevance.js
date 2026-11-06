// Conservative topical bonus for Rakuten official search results.
// Keeps API's returned candidates eligible; never guesses product claims.
const GENERIC=new Set(['便利グッズ','便利','グッズ','おすすめ','人気','楽天','商品','アイテム','ランキング','家事','時短']);
export function keywordRelevanceBonus(keyword, itemName) {
 const terms=String(keyword||'').normalize('NFKC').trim().split(/[\s　]+/)
   .map(x=>x.trim()).filter(x=>x.length>=2&&!GENERIC.has(x)).slice(0,5);
 if(!terms.length)return 0;
 const name=String(itemName||'').normalize('NFKC').toLowerCase();
 const hits=terms.filter(x=>name.includes(x.toLowerCase())).length;
 // Small bounded bonus: reviews and price still matter, topic match breaks ties.
 return Math.min(15,hits*10);
}
