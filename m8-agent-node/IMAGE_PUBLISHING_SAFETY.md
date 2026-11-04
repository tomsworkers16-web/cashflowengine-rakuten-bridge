# Image publishing safety (2026-11-05)

The registered image for `k-style:10002149` is stored locally on the M8 node. Registration confirms that a file was accepted; it does **not** establish reuse rights for a composed image, a trademarked design, or time-sensitive promotional claims.

## Default behavior

- `rakuten_affiliate_link_creator` images are **excluded** from generated product cards by default.
- With the exclusion in place, `renderProductCard` generates an original, typography-only card; it does not copy the product photograph.
- `CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED=true` is an opt-in gate, **not** proof of authorization. Do not enable without verifying the precise source image, transformation, distribution channel, and campaign information against applicable permissions.
- Image publishing stays disabled unless `CFE_IMAGE_POST_ENABLED=true`. The existing text-only Threads API posting path remains available if `CFE_AUTO_POST_ENABLED=true`.
- The preview command reports `productPhotoIncluded`. A successful preview is not proof that a product photo was used.
- The local image store and `.env` are not copied to GitHub through this change. A GitHub pull does not restart M8 services.

## M8 validation (non-posting)

From `m8-agent-node`:

```powershell
git pull
npm.cmd run check
npm.cmd run preview-image -- "k-style:10002149"
npm.cmd run verify
```

Expected by default: `productPhotoIncluded: false`, `publicationAttempted: false`, `template: editorial-discovery-v1` (or `editorial-compare-v1`), unless an explicitly reviewed asset source exists. API verification is dry-run and does not publish posts.

For final integration, validate a genuine authorized image separately and confirm the actual Threads post ID and permalink after publication. Do not treat a browser submit click as successful publication.
