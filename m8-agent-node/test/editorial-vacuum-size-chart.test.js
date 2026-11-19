import test from 'node:test';
import assert from 'node:assert/strict';
import {extractVacuumSizeChart} from '../src/editorial-vacuum-size-chart.js';
const html='<html><body>サイズ（横×奥行×高さ）(mm) ◆自動真空ポンプ 80×80×52 '+
 '◆MINI ・0.3L 108×108×69 ・0.5L 167×108×69 ・0.8L 168×168×69 '+
 '◆BASIC ・0.5L 108×108×106 ・1.0L 167×108×101 ・1.4L 168×168×102 '+
 '◆HIGH ・1.0L 108×108×174 ・2.0L 167×108×180 ・3.1L 168×168×180 '+
 '◆LONG ・1.95L 108×108×287 ◆LARGE ・4.0L 267×217×102 素材 容器 AS 樹脂</body></html>';
test('extracts eleven published catalogue capacity and size combinations',()=>{
 const r=extractVacuumSizeChart(html);
 assert.equal(r.status,'size_chart_extracted');
 assert.equal(r.variants.length,11);
 assert.deepEqual(r.variants[0],{series:'MINI',capacityLiters:0.3,widthMm:108,depthMm:108,heightMm:69});
 assert.deepEqual(r.variants.at(-1),{series:'LARGE',capacityLiters:4,widthMm:267,depthMm:217,heightMm:102});
 assert.equal(r.selectedVariant,null);
});
test('no SKU inference when size chart is absent or unbounded',()=>{
 assert.equal(extractVacuumSizeChart('<html><body>真空保存容器 0.3L</body></html>').variants.length,0);
 assert.equal(extractVacuumSizeChart('<html><body>サイズ（横×奥行×高さ） ◆MINI ・0.3L 108×108×69</body></html>').status,'size_chart_unbounded');
});
test('repeated size in one series is not promoted as unique purchase option',()=>{
 const page='<html><body>サイズ（横×奥行×高さ） ◆MINI ・0.3L 108×108×69 ・0.3L 200×200×200 素材 AS樹脂</body></html>';
 assert.equal(extractVacuumSizeChart(page).status,'size_chart_ambiguous');
});
