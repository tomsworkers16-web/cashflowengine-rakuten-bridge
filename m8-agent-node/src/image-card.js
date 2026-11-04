import fs from 'node:fs';
import path from 'node:path';
import { cleanProductName } from './product-posting.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIN_RIGHTS_HOLDER_PX = 600;
const MIN_AFFILIATE_PX = 400;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Local opt-in manifest only. API thumbnails and unauthorised Rakuten product-page scraping are NOT image licences.
// For affiliate link creator images: caller must publish the associated Rakuten affiliate link.
export function approvedImageFor(item, dataDir, { hasAffiliateLink = false } = {}) {
  const code = String(item?.itemCode || '');
  if (!code) return null;
  const base = path.resolve(dataDir, 'approved-product-images');
  const manifestPath = path.join(base, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  let entries;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    entries = Array.isArray(parsed) ? parsed : parsed.items;
  } catch { return null; }
  if (!Array.isArray(entries)) return null;
  const entry = entries.find(x => x?.itemCode === code && x?.approved === true);
  if (!entry) return null;
  const source = String(entry.source || '');
  if (source !== 'rights_holder_permission' && source !== 'rakuten_affiliate_link_creator') return null;
  if (source === 'rakuten_affiliate_link_creator' && !hasAffiliateLink) return null;
  if (!entry.permissionReference || !String(entry.permissionReference).trim()) return null;
  const name = String(entry.filename || '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}\.(png|jpg|jpeg)$/i.test(name)) return null;
  const filename = path.resolve(base, name);
  if (path.dirname(filename) !== base || !fs.existsSync(filename)) return null;
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES || stat.size < 1000) return null;
  const ext = path.extname(filename).toLowerCase();
  return { path: filename, mime: ext === '.png' ? 'image/png' : 'image/jpeg', source };
}

export async function renderProductCard(context, item, role, dataDir, opts = {}) {
  const asset = approvedImageFor(item, dataDir, opts);
  if (!asset) return renderEditorialCard(context, item, role, dataDir);
  const imageData = fs.readFileSync(asset.path);
  const dataUrl = 'data:' + asset.mime + ';base64,' + imageData.toString('base64');
  const original = cleanProductName(item?.itemName);
  if (!original) throw new Error('missing_product_name');
  const name = original.length > 34 ? original.slice(0, 33) + '…' : original;
  const headline = role === 'comparison' ? '選ぶ前に、ここをチェック' : 'こんなの見つけた！';
  const subtitle = role === 'comparison' ? 'SIZE / CARE / STORAGE' : '暮らしの気になるアイテム';
  const price = Number(item?.price) > 0 ? '約 ' + Number(item.price).toLocaleString('ja-JP') + ' 円' : '価格は商品ページで確認';
  const count = Number(item?.reviewCount);
  const reviews = count > 0 ? 'レビュー ' + count.toLocaleString('ja-JP') + ' 件' : '気になる一品';
  const folder = path.join(dataDir, 'image-cards');
  fs.mkdirSync(folder, { recursive: true });
  const key = String(item?.itemCode || 'product').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(-48);
  const filename = path.join(folder, [Date.now(), role, key].join('-') + '.png');
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1080, height: 1350 });
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      body{margin:0;background:#f6f3ec;color:#283d33;font-family:"Yu Gothic","Meiryo",Arial,sans-serif}
      .paper{width:1080px;height:1350px;padding:62px 74px;position:relative;background:#f8f5ed}
      .top{font-size:27px;letter-spacing:5px;font-weight:800;border-bottom:2px solid #283d33;padding-bottom:19px}
      .eyebrow{font-size:22px;letter-spacing:3px;margin-top:35px;color:#667669}
      .headline{font-size:57px;font-weight:800;margin:12px 0 29px;line-height:1.2}
      .image-frame{height:705px;background:#fff;border:1px solid #e2e6de;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden}
      .image-frame img{width:min(100%,500px);height:auto;max-height:570px;object-fit:contain;display:block}
      .label{margin-top:24px;font-size:32px;font-weight:800;line-height:1.42;max-height:94px;overflow:hidden}
      .row{display:flex;justify-content:space-between;align-items:center;margin-top:17px}
      .price{font-size:39px;font-weight:800}.reviews{font-size:22px}
      .footer{position:absolute;bottom:32px;left:74px;right:74px;border-top:1px solid #91a296;padding-top:16px;font-size:15px;color:#617064;display:flex;justify-content:space-between}
    </style></head><body><div class="paper"><div class="top">RAKUMITSU SELECT</div>
      <div class="eyebrow">${esc(subtitle)}</div><div class="headline">${esc(headline)}</div>
      <div class="image-frame"><img id="product" src="${dataUrl}"/></div>
      <div class="label">${esc(name)}</div><div class="row"><span class="price">${esc(price)}</span><span class="reviews">${esc(reviews)}</span></div>
      <div class="footer"><span>商品画像は提供元の利用条件に基づき掲載</span><span>価格・情報は取得時点 / 購入前に確認</span></div>
    </div></body></html>`;
    await page.setContent(html, { waitUntil: 'load', timeout: 25000 });
    const dimensions = await page.locator('#product').evaluate(img => ({
      loaded: img.complete && img.naturalWidth > 0, width: img.naturalWidth, height: img.naturalHeight
    }));
    const minimum = asset.source === 'rakuten_affiliate_link_creator' ? MIN_AFFILIATE_PX : MIN_RIGHTS_HOLDER_PX;
    if (!dimensions.loaded || Math.min(dimensions.width, dimensions.height) < minimum)
      throw new Error('source_image_below_' + minimum + 'px_minimum');
    await page.screenshot({ path: filename, animations: 'disabled', timeout: 15000 });
    return { path: filename, template: role === 'comparison' ? 'compare-v3' : 'discover-v3',
      sourceImagePath: asset.path, sourceWidth: dimensions.width, sourceHeight: dimensions.height };
  } finally { await page.close().catch(() => {}); }
}

// Original typography-only editorial card. No third-party product image is copied or implied.
// The card is an alternative creative format, NOT a photograph of the product.
export async function renderEditorialCard(context, item, role, dataDir) {
  const name = cleanProductName(item?.itemName);
  if (!name) throw new Error('missing_product_name');
  const headline = role === 'comparison' ? 'どこを比べる？' : 'こんなの見つけた！';
  const subline = role === 'comparison' ? '買う前にチェックしたい3つ' : '気になる暮らしのアイテム';
  const price = Number(item?.price) > 0 ? '約 ' + Number(item.price).toLocaleString('ja-JP') + '円' : '価格は商品ページで確認';
  const reviews = Number(item?.reviewCount) >= 1 ? Number(item.reviewCount).toLocaleString('ja-JP') + '件のレビュー' : '使い勝手を確認したい';
  const folder = path.join(dataDir, 'image-cards');
  fs.mkdirSync(folder, { recursive: true });
  const key = String(item?.itemCode || 'product').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(-48);
  const filename = path.join(folder, [Date.now(), 'editorial', key].join('-') + '.png');
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1080, height: 1350 });
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;background:#f8f5eb;color:#203c2c;font-family:"Yu Gothic","Meiryo",Arial,sans-serif}
    .sheet{width:1080px;height:1350px;padding:68px 78px;position:relative;overflow:hidden;background:#f7f2e8}
    .head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #224735;padding-bottom:22px;font-weight:900;letter-spacing:4px;font-size:24px}
    .volume{font-size:16px;letter-spacing:1px}
    .eyebrow{margin-top:58px;font-size:25px;letter-spacing:4px;color:#637362;font-weight:700}
    .title{font-size:72px;letter-spacing:-1px;margin-top:14px;line-height:1.25;font-weight:900}
    .feature{position:absolute;top:380px;left:78px;right:78px;height:560px;background:#264b37;border-radius:23px;padding:50px 52px;color:white}
    .accent{font-size:17px;letter-spacing:4px;color:#b6d5b1;font-weight:700}
    .name{margin-top:58px;font-size:47px;line-height:1.35;font-weight:900;overflow-wrap:anywhere;max-height:280px;overflow:hidden}
    .footer-panel{position:absolute;top:975px;left:78px;right:78px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .price{font-size:47px;font-weight:900}
    .reviews{font-size:24px;max-width:330px;text-align:right;padding-top:15px}
    .note{position:absolute;bottom:74px;left:78px;right:78px;border-top:2px solid #b7c4b6;padding-top:19px;font-size:21px;color:#506453}
    .issue{position:absolute;bottom:25px;left:78px;right:78px;font-size:17px;color:#7a8878}
    </style></head><body><main class="sheet">
    <header class="head"><span>RAKUMITSU SELECT</span><span class="volume">LIFE / FINDS</span></header>
    <div class="eyebrow">${esc(subline)}</div><div class="title">${esc(headline)}</div>
    <section class="feature"><div class="accent">PICK UP ITEM</div><div class="name">${esc(name)}</div></section>
    <section class="footer-panel"><div class="price">${esc(price)}</div><div class="reviews">${esc(reviews)}</div></section>
    <div class="note">サイズ・素材・使い勝手は商品情報で確認してね。</div>
    <div class="issue">TEXT-ONLY EDITORIAL CARD / 商品写真ではありません</div>
    </main></body></html>`;
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    await page.screenshot({ path: filename, animations: 'disabled', timeout: 15000 });
    return { path: filename, template: role === 'comparison' ? 'editorial-compare-v1' : 'editorial-discovery-v1', source: 'original_typography_no_product_photo' };
  } finally { await page.close().catch(() => {}); }
}

// Browser write is deliberately feature-gated: selectors need verification on the M8 profile.
export async function publishImageBrowser(context, imagePath, text) {
  if (!fs.existsSync(imagePath)) throw new Error('image_card_file_missing');
  const page = await context.newPage();
  let submitAttempted = false;
  try {
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
    if (/login|accounts\/login/i.test(page.url())) throw new Error('threads_reauth_required');
    const compose = page.getByRole('button', { name: /新しいスレッド|新規投稿|New thread|Create post/i }).first();
    if (await compose.count() !== 1) throw new Error('compose_button_not_found');
    await compose.click({ timeout: 8000 });
    const editor = page.getByRole('textbox').last();
    if (await editor.count() !== 1) throw new Error('composer_editor_not_found');
    await editor.fill(text);
    const input = page.locator('input[type="file"][accept*="image"]').last();
    if (await input.count() !== 1) throw new Error('image_file_input_not_found');
    await input.setInputFiles(imagePath);
    const preview = page.locator('img[src^="blob:"]').last();
    await preview.waitFor({ state: 'visible', timeout: 12000 });
    const submit = page.getByRole('button', { name: /^(投稿|Post)$/i }).last();
    if (await submit.count() !== 1 || !(await submit.isEnabled())) throw new Error('image_submit_button_not_ready');
    submitAttempted = true;
    await submit.click({ timeout: 9000 });
    return { status: 'unverified', submitAttempted: true };
  } catch (error) {
    error.submitAttempted = submitAttempted;
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}
