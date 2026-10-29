import fs from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

const aliases = {
  date: ['日付','発生日','成果発生日','クリック日','注文日','対象日'],
  clicks: ['クリック数','クリック'],
  orders: ['売上件数','注文件数','成果件数','件数'],
  sales: ['売上金額','売上','購入金額','成果対象金額'],
  commission: ['成果報酬','成果報酬額','報酬額','成果報酬ポイント'],
  status: ['ステータス','状態'],
  shopName: ['ショップ名','サービス名'],
  itemName: ['商品名'],
  genre: ['ジャンル','商品ジャンル'],
  linkId: ['リンクID','リンク識別子','アフィリエイトリンクID']
};

function normHeader(s) { return String(s || '').replace(/^\uFEFF/, '').trim(); }
function findIndex(headers, names) {
  const normalized = headers.map(normHeader);
  for (const name of names) {
    const i = normalized.findIndex(h => h === name || h.includes(name));
    if (i >= 0) return i;
  }
  return -1;
}
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[¥￥,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function val(row, idx) { return idx >= 0 ? String(row[idx] ?? '').trim() : null; }

function normalizeCsv(csvText, source = 'rakuten-affiliate-csv') {
  const rows = parseCsv(csvText);
  if (!rows.length) return { source, generatedAt: new Date().toISOString(), rows: [] };
  const headers = rows[0].map(normHeader);
  const ix = Object.fromEntries(Object.entries(aliases).map(([k, names]) => [k, findIndex(headers, names)]));
  const out = [];
  for (const row of rows.slice(1)) {
    const rec = {
      date: val(row, ix.date),
      clicks: num(val(row, ix.clicks)),
      orders: num(val(row, ix.orders)),
      sales: num(val(row, ix.sales)),
      commission: num(val(row, ix.commission)),
      status: val(row, ix.status),
      shopName: val(row, ix.shopName),
      itemName: val(row, ix.itemName),
      genre: val(row, ix.genre),
      linkId: val(row, ix.linkId)
    };
    if (Object.values(rec).some(v => v !== null && v !== '')) out.push(rec);
  }
  return {
    source,
    generatedAt: new Date().toISOString(),
    detectedHeaders: headers,
    fieldIndexes: ix,
    rowCount: out.length,
    rows: out
  };
}

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node rakuten-report-normalize.js <input.csv> [output.json]');
  process.exit(1);
}
const result = normalizeCsv(fs.readFileSync(input, 'utf8'));
const json = JSON.stringify(result, null, 2);
if (output) fs.writeFileSync(output, json + '\n');
else process.stdout.write(json + '\n');
