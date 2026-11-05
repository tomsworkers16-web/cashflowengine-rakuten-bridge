# Affiliate result import (strict, evidence-first)

The night report reads optional local file `.data/affiliate-results.json` or the equivalent directory under `CFE_DATA_DIR`. Absence of this file is normal and yields `unknown` values, never fabricated zeroes.

Format:
```json
{
  "records": [
    {
      "jstDate": "2026-11-05",
      "source": "rakuten_dashboard",
      "clicks": 10,
      "orders": 1,
      "rewardYen": 80,
      "costYen": 0,
      "itemCode": "shop:123"
    }
  ]
}
```

All numbers above are **format examples only**, not actual Cash Flow Engine results. Provide only values supported by the named source. A missing cost is unknown, NOT assumed zero. Net profit is computed only when both reward and cost are numeric. `itemCode` is optional; product-level attribution is unverified until the source supports it. Do not insert placeholder records into production data.

Future work: implement a consented, supported dashboard or report import with an explicit source-specific mapping. Do not scrape private pages or infer conversions from Threads views. A report should carry its download date and provenance before being accepted as verified business evidence.

Safety: `affiliate-results.json` remains local and should not be committed to Git.
