// Read-only matching of an official measurement ID to a reviewed content registry.
// This is a candidate association, never proof of an order, purchase identity or profit.
import { parseCsv } from './rakuten-csv.js';
import { auditRakutenOrderReport } from './rakuten-order-report-audit.js';

const JA=['発生日','成果報酬','料率','売上金額','ジャンル名','ショップ名','商品名','ステータス','リンクタイプ','デバイスタイプ','計測ID'];
const EN=['date','rewards','rate','amount','genre_name','shop_name','item_name','status','link_type','device_type','measurement_id'];
const same=(row,header)=>row?.length===header.length&&row.every((v,i)=>v.trim()===header[i]);
const id=value=>typeof value==='string'&&value.trim()&&value.trim().length<=128&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
const contentId=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value)?value:null;

export function auditMeasurementAttribution(csv, registry) {
  const report=auditRakutenOrderReport(csv);
  const base={mode:'read_only_candidate_association',report,
    attributionVerified:false,itemProfitEligible:false,published:0};
  if(report.status==='order_report_unverified')return {...base,status:'report_unverified'};
  if(!Array.isArray(registry)||registry.length>10000)return {...base,status:'registry_invalid'};
  const groups=new Map();
  let invalidRegistryRows=0;
  for(const entry of registry){
    const key=id(entry?.measurementId);
    if(!key||key==='-'||key==='－'){invalidRegistryRows++;continue;}
    const scope=entry.scope??'content';
    const target=scope==='content'?entry.contentId:scope==='cohort'?entry.cohortId:null;
    const valid=Boolean(contentId(target)&&['threads','note'].includes(entry.channel));
    if(!valid)invalidRegistryRows++;
    const group=groups.get(key)||[];
    group.push({valid,scope,target:valid?target:null,channel:valid?entry.channel:null,
      confirmed:valid&&entry.officialLinkConfirmed===true&&entry.publicationConfirmed===true&&entry.reportIdVerified===true});
    groups.set(key,group);
  }
  if(groups.size>20)return {...base,status:'registry_invalid',reason:'official_id_capacity_exceeded'};
  const rows=parseCsv(csv.replace(/^\uFEFF/,''));
  const start=rows.findIndex((row,i)=>same(row,JA)&&same(rows[i+1],EN));
  const body=rows.slice(start+2);
  const counts={matchedRows:0,unknownIdRows:0,missingIdRows:0,ambiguousIdRows:0,unconfirmedRegistryRows:0};
  const byContent=new Map(),byCohort=new Map();
  for(const row of body){
    const key=id(row[10]);
    if(!key||key==='-'||key==='－'){counts.missingIdRows++;continue;}
    const group=groups.get(key);
    if(!group){counts.unknownIdRows++;continue;}
    if(group.length!==1){counts.ambiguousIdRows++;continue;}
    const entry=group[0];
    if(!entry.confirmed){counts.unconfirmedRegistryRows++;continue;}
    counts.matchedRows++;
    const index=JSON.stringify([entry.channel,entry.target]);
    const bucket=entry.scope==='cohort'?byCohort:byContent;
    const field=entry.scope==='cohort'?'cohortId':'contentId';
    const current=bucket.get(index)||{channel:entry.channel,[field]:entry.target,matchingReportRows:0};
    current.matchingReportRows++;
    bucket.set(index,current);
  }
  return {...base,status:body.length?'report_rows_assessed':'no_report_rows',
    registry:{entries:registry.length,invalidRegistryRows,ambiguousIds:[...groups.values()].filter(g=>g.length!==1).length},
    ...counts,contentMatches:[...byContent.values()],cohortMatches:[...byCohort.values()],
    caveat:'Exact report ID match against a locally asserted registry only; cohort matches never identify individual posts; reports may contain repeated or unrelated purchases. Do not sum across snapshots, infer clicks or realized profit, or treat row counts as orders.'};
}
