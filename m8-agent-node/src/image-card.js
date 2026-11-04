import fs from 'node:fs';
import path from 'node:path';
import { cleanProductName } from './product-posting.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cleanUrl = (s) => {
  try {
    const u = new URL(typeof s === 'string' ? s : s?.imageUrl || s?.url || '');
    if (u.protocol !== 'https:' || !/(\.|^)rakuten\.co\.jp$|(\.|^)rakuten\.ne\.jp$|(\.|^)rakuten\.com$/i.test(u.hostname)) return '';
    return u.toString();
  } catch { return ''; }
};

export function getProductImage(item) {
  const urls = [...(item?.mediumImageUrls || []), ...(item?.smallImageUrls || [])];
  for (const entry of urls) {
    const url = cleanUrl(entry);
    if (url) return url;
  }
  return '';
}

export async function renderProductCard(context, item, role, dataDir) {
  const url = getProductImage(item);
  if (!url) throw new Error('no_approved_rakuten_image_url');
  const name = cleanProductName(item?.itemName);
  if (!name) throw new Error('missing_product_name');
  const headline = role === 'comparison' ? '選ぶ前に、ここをチェック' : 'こんなの見つけた！';
  const subtitle = role === 'comparison' ? 'SIZE  /  CARE  /  STORAGE' : '暮らしの気になるアイテム';
  const price = Number(item?.price) > 0 ? '約 ' + Number(item.price).toLocaleString('ja-JP') + ' 円' : '価格は商品ページで確認';
  const count = Number(item?.reviewCount);
  const reviews = count > 0 ? 'レビュー ' + count.toLocaleString('ja-JP') + ' 件' : '気になる一品';
  const key = String(item?.itemCode || 'product').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(-48);
  const folder = path.join(dataDir, 'image-cards');
  fs.mkdirSync(folder, { recursive: true });
  const filename = path.join(folder, [Date.now(), role, key].join('-') + '.png');
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1080, height: 1350 });
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box} body{margin:0;background:#f5f0e7;color:#25382e;font-family:"Yu Gothic","Meiryo",Arial,sans-serif}
      .paper{width:1080px;height:1350px;padding:62px 78px;position:relative;background:#f8f4ec}
      .top{font-size:28px;letter-spacing:6px;font-weight:800;border-bottom:2px solid #283e33;padding-bottom:19px}
      .eyebrow{font-size:23px;letter-spacing:2px;margin-top:52px;color:#68786b}
      .headline{font-size:61px;font-weight:800;margin:12px 0 36px;line-height:1.25}
      .image-frame{height:660px;background:white;border:1px solid #deded7;display:flex;align-items:center;justify-content:center;padding:20px}
      .image-frame img{max-width:100%;max-height:100%;object-fit:contain}
      .label{margin-top:27px;font-size:28px;font-weight:800;line-height:1.5;max-height:110px;overflow:hidden}
      .row{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
      .price{font-size:36px;font-weight:800}.reviews{font-size:22px}
      .footer{position:absolute;bottom:30px;left:78px;right:78px;border-top:1px solid #87968a;padding-top:15px;font-size:16px;color:#58675c;display:flex;justify-content:space-between}
    </style></head><body><div class="paper"><div class="top">RAKUMITSU SELECT</div>
      <div class="eyebrow">${esc(subtitle)}</div><div class="headline">${esc(headline)}</div>
      <div class="image-frame"><img id="product" src="${esc(url)}" referrerpolicy="no-referrer"/></div>
      <div class="label">${esc(name)}</div><div class="row"><span class="price">${esc(price)}</span><span class="reviews">${esc(reviews)}</span></div>
      <div class="footer"><span>商品画像：楽天市場掲載商品</span><span>価格・情報は取得時点 / 購入前に再確認</span></div>
    </div></body></html>`;
    await page.setContent(html, { waitUntil: 'load', timeout: 25000 });
    const loaded = await page.locator('#product').evaluate(img => img.complete && img.naturalWidth > 0);
    if (!loaded) throw new Error('product_image_not_loaded');
    await page.screenshot({ path: filename, animations: 'disabled', timeout: 15000 });
    return { path: filename, template: role === 'comparison' ? 'compare-v1' : 'discover-v1', sourceImageUrl: url };
  } finally {
    await page.close().catch(() => {});
  }
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
