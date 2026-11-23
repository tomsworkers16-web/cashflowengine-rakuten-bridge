// Usage: node src/run-rakuten-measurement-attribution.js order.csv registry.json
import {readFileSync,statSync} from 'node:fs';
import {auditMeasurementAttribution} from './rakuten-measurement-attribution.js';
try {
 const [csvFile,registryFile]=process.argv.slice(2);
 if(!csvFile||!registryFile||[csvFile,registryFile].some(file=>!statSync(file).isFile()||statSync(file).size>5*1024*1024))throw Error('invalid_input');
 const csv=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(csvFile));
 const registry=JSON.parse(readFileSync(registryFile,'utf8'));
 const result=auditMeasurementAttribution(csv,registry);
 console.log(JSON.stringify(result,null,2));
 if(['report_unverified','registry_invalid'].includes(result.status))process.exitCode=2;
}catch{console.error('measurement_attribution_input_invalid');process.exitCode=2;}
