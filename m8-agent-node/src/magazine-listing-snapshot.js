// Local-only cache of normalized listing data; never stores credentials or request URLs.
import {writeFile,readFile} from 'node:fs/promises';
const fields=['itemCode','itemName','price','affiliateUrl','reviewCount','reviewAverage','affiliateRate'];
export function captureListingSearch(search,{day,slot='19:30',now=()=>new Date().toISOString()}={}){
 const entries=[];
 return {search:async keyword=>{
  const items=await search(keyword);
  if(!Array.isArray(items))throw Error('snapshot_invalid_items');
  const clean=items.map(item=>Object.fromEntries(fields.filter(k=>item?.[k]!==undefined).map(k=>[k,item[k]])));
  entries.push({keyword,items:clean});
  return clean;
 },snapshot:()=>({version:1,day,slot,capturedAt:now(),entries:[...entries]})};
}
export function replayListingSearch(snapshot,{day,slot='19:30'}={}){
 if(snapshot?.version!==1||snapshot.day!==day||snapshot.slot!==slot||!Array.isArray(snapshot.entries)||!Number.isFinite(Date.parse(snapshot.capturedAt)))throw Error('snapshot_invalid');
 const byKeyword=new Map();
 for(const entry of snapshot.entries){
  if(typeof entry.keyword!=='string'||!Array.isArray(entry.items)||byKeyword.has(entry.keyword))throw Error('snapshot_invalid');
  byKeyword.set(entry.keyword,entry.items);
 }
 return async keyword=>{
  if(!byKeyword.has(keyword))throw Error('snapshot_missing_keyword');
  return byKeyword.get(keyword);
 };
}
export async function saveListingSnapshot(path,snapshot){
 // Fail rather than overwrite an existing investigation.
 await writeFile(path,JSON.stringify(snapshot,null,2)+'\n',{encoding:'utf8',flag:'wx'});
}
export async function loadListingSnapshot(path){
 return JSON.parse(await readFile(path,'utf8'));
}
export function asciiJson(value){
 return JSON.stringify(value,null,2).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
}
