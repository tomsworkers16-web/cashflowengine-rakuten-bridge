import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { approvedImageFor } from '../src/image-card.js';

test('Rakuten images fail closed, while explicit rights-holder images remain usable', () => {
  const old = process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfe-image-policy-'));
  const folder = path.join(dataDir, 'approved-product-images');
  fs.mkdirSync(folder, { recursive: true });
  const filename = 'photo.png';
  fs.writeFileSync(path.join(folder, filename), Buffer.alloc(1200));
  const save = (source) => fs.writeFileSync(path.join(folder, 'manifest.json'),
    JSON.stringify({items:[{itemCode:'shop:123',filename,approved:true,source,permissionReference:'reviewed permission'}]}));
  try {
    delete process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED;
    save('rakuten_affiliate_link_creator');
    assert.equal(approvedImageFor({itemCode:'shop:123'}, dataDir, {hasAffiliateLink:true}), null);
    process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED = 'true';
    assert.ok(approvedImageFor({itemCode:'shop:123'}, dataDir, {hasAffiliateLink:true}));
    assert.equal(approvedImageFor({itemCode:'shop:123'}, dataDir, {hasAffiliateLink:false}), null);
    delete process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED;
    save('rights_holder_permission');
    assert.ok(approvedImageFor({itemCode:'shop:123'}, dataDir));
  } finally {
    if (old === undefined) delete process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED;
    else process.env.CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED = old;
    fs.rmSync(dataDir, {recursive:true,force:true});
  }
});
