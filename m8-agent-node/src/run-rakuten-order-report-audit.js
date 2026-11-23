import {readFileSync,statSync} from 'node:fs';
import {auditRakutenOrderReport} from './rakuten-order-report-audit.js';
try {
 const file=process.argv[2];
 if(!file||!statSync(file).isFile()||statSync(file).size>5*1024*1024)throw Error('invalid_input');
 const csv=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(file));
 const result=auditRakutenOrderReport(csv);
 console.log(JSON.stringify(result,null,2));
 if(result.status==='order_report_unverified')process.exitCode=2;
}catch{
 console.error('order_report_unreadable');process.exitCode=2;
}
