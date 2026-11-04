import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { renderProductCard, approvedImageFor } from './image-card.js';

const env = process.env;
const root = process.cwd();
const dataDir = path.resolve(env.CFE_DATA_DIR || '.data');
const base = env.RAKUTEN_API_BASE || 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const appId = env.RAKUTEN_APPLICATION_ID || '';
const accessKey = env.RAKUTEN_ACCESS_KEY || '';
const affiliateId = env.RAKUTEN_AFFILIATE_ID || '';
const userQuery = process.argv.slice(2).join(' ') || 'キッチン 便利グッズ';
const itemCode = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(userQuery) ? userQuery : null;
const chromePaths = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
const executablePath = chromePaths.find(p => fs.existsSync(p));
if (!executablePath) throw new Error('chrome_not_found');
if (!appId || !accessKey || !affiliateId) throw new Error('rakuten_credentials_missing');

const q = new URLSearchParams({
  applicationId: appId, accessKey, affiliateId, hits: '20',
  format: 'json', availability: '1', imageFlag: '1'
});
if (itemCode) q.set('itemCode', itemCode);
else q.set('keyword', userQuery);
const response = await fetch(base + '?' + q, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error('rakuten_http_' + response.status);
const result = await response.json();
const items = (result.Items || result.items || []).map(x => x.Item || x.item || x);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext();
  let done = false;
  for (const i of items) {
    try {
      const item = {
        itemName: i.itemName, itemCode: i.itemCode, price: i.itemPrice,
        reviewCount: i.reviewCount, mediumImageUrls: i.mediumImageUrls || [],
        smallImageUrls: i.smallImageUrls || []
      };
      const linked = /^https:\/\//.test(String(i.affiliateUrl || ''));
      const approved = approvedImageFor(item, dataDir, { hasAffiliateLink: linked });
      const role = approved?.source === 'rakuten_affiliate_link_creator' && linked ? 'revenue' : 'discovery';
      const card = await renderProductCard(context, item, role, dataDir, { hasAffiliateLink: linked && role === 'revenue' });
      console.log(JSON.stringify({
        ok: true,
        imagePath: card.path,
        template: card.template,
        itemCode: i.itemCode,
        productPhotoIncluded: Boolean(card.sourceImagePath),
        publicationAttempted: false,
        note: card.sourceImagePath ? 'approved_image_rendered' : 'editorial_text_only_no_product_photo'
      }, null, 2));
      done = true;
      break;
    } catch (error) {
      console.error('candidate_skipped:' + error.message);
    }
  }
  if (!done) {
    console.log(JSON.stringify({
      ok: false, status: 'no_approved_high_resolution_image',
      reason: 'Only expressly approved >=600px images may be rendered. API thumbnails are excluded.',
      manifest: path.join(dataDir, 'approved-product-images', 'manifest.json'),
      threadsPosted: false
    }, null, 2));
  }
} finally {
  await browser.close();
}
