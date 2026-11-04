import fs from 'node:fs';
import path from 'node:path';
import { cleanProductName } from './product-posting.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIN_SOURCE_PX = 600;
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
  if (!asset) throw new Error('no_licensed_high_resolution_image_for_item');
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
      .image-frame img{width:100%;height:100%;object-fit:contain;display:block}
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
    if (!dimensions.loaded || Math.min(dimensions.width, dimensions.height) < MIN_SOURCE_PX)
      throw new Error('source_image_below_600px_minimum');
    await page.screenshot({ path: filename, animations: 'disabled', timeout: 15000 });
    return { path: filename, template: role === 'comparison' ? 'compare-v3' : 'discover-v3',
      sourceImagePath: asset.path, sourceWidth: dimensions.width, sourceHeight: dimensions.height };
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
