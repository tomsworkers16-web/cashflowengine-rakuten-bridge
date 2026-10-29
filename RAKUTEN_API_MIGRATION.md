# Cash Flow Engine #001 — Rakuten API migration

Updated: 2026-10-29

## Decision

Priority order for Rakuten operations:

1. Rakuten official APIs / official machine-readable exports
2. Existing Rakuten bridge
3. TinyFish browser automation only where the first two cannot provide the data

Product discovery and affiliate URL creation are already API based. Do not use TinyFish for those paths.

## Official capability matrix

| Data / operation | Classification | Notes |
|---|---|---|
| Item search | API available | Rakuten Ichiba Item Search API v2026-07-01 |
| Ranking / product discovery | API available | Rakuten Ichiba Ranking API; current `/daily-plan` may continue using search because it already works |
| Product name / price / review count / rating | API available | Item Search API response |
| Affiliate URL generation | API available | Include `affiliateId`; response contains `affiliateUrl` |
| Affiliate clicks | Official non-API export | Affiliate Report UI + CSV download; no public affiliate-results API found in official Web Service catalog |
| Orders / sales count | Official non-API export | Affiliate Report / CSV |
| Sales amount | Official non-API export | Affiliate Report / CSV |
| Commission | Official non-API export | Affiliate Report / CSV |
| Order / conversion detail | Official non-API export | Order detail report / CSV |
| Confirmed / unconfirmed / rejected status | Official non-API export | Order detail report |
| Daily performance | Official non-API export | Period report and shop daily report |
| Per-item performance | Partially available via official report | Order detail includes item name / genre / status. Official docs do not establish reliable per-link/post attribution. Treat direct post-to-order attribution as unavailable unless the export exposes a stable link identifier.

## Existing implementation

- API endpoint: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`
- Authentication: `RAKUTEN_APPLICATION_ID` + `RAKUTEN_ACCESS_KEY`
- Affiliate: `RAKUTEN_AFFILIATE_ID` is sent as `affiliateId`; `affiliateUrl` is returned by Rakuten
- `/daily-plan`: scans predefined themes, sorts by review count, scores candidates, deduplicates and keeps top 20
- Current scoring factors: review average, review count, price band, shipping, point rate, affiliate URL presence
- Threads automation consumes `/daily-plan`; no TinyFish is required for product discovery or link creation

## Target architecture

Rakuten official APIs
→ Rakuten bridge `/daily-plan`
→ product scoring and selection
→ Threads post generation
→ API-generated `affiliateUrl`
→ publish
→ Threads metrics (Meta official API first, Windsor backup)
→ Rakuten Affiliate official report CSV (daily, once only)
→ normalization (`rakuten-report-normalize.js`)
→ funnel join (`rakuten-funnel.js`)
→ views → clicks → orders → sales → commission → estimated profit
→ next-day rules

## TinyFish policy

Use TinyFish only to obtain the official Rakuten Affiliate report export when no API/official direct machine endpoint is available.

Rules:

- at most once per day
- use the existing Rakuten browser profile
- navigate directly to the required report/export page
- download only the needed report(s)
- do not revisit dashboard pages merely to read summary numbers
- persist the downloaded/normalized result before any further analysis
- never refetch the same report date after successful ingestion
- product search, product metadata, ranking candidates and affiliate URL creation must not use TinyFish

## Attribution limits

Rakuten's public affiliate report documentation supports daily, shop and order-detail reporting, including item name and status. It does not document a public API or a guaranteed post/link-level identifier that maps a conversion to a specific Threads post.

Therefore:

- Threads engagement metrics are exact per post.
- Rakuten clicks/orders/sales/commission are exact at the granularity provided by the report export.
- Per-post affiliate attribution is `exact` only when a stable unique link identifier exists in the exported data.
- Otherwise attribution must be marked `estimated` and may use item/date/window matching; never present estimated attribution as exact.

## Minimal implementation added

- `rakuten-report-normalize.js`: normalize Rakuten Affiliate CSV exports into a stable JSON schema.
- `rakuten-funnel.js`: join normalized Rakuten outcomes to Threads/post mapping data, with explicit attribution confidence.

No new paid service, account or credential is required for this phase.
