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

## Import deduplication

If the data source supplies a stable identifier for an individual result row, include
`"recordId":"source-unique-id"`. Repeated rows with the same `source` + `recordId`
are counted once and the nightly report exposes `duplicateRecordsIgnored`.

This protects against accidentally importing the same result twice. Rows **without**
stable IDs cannot be safely deduplicated; avoid re-importing overlapping reports.
Do not invent an order-level record ID where the provider offers only day-level totals.
Do not combine daily totals and order-level details for the same metric or source,
because this would double-count. The current importer has no source-specific semantics
for overlapping totals.

## CSV intake (new)

Cash Flow Engine can parse **daily-period** Rakuten affiliate CSV exports with mapped date, clicks, order count and provisional reward columns. The known-column parser intentionally rejects unexpected report layouts rather than producing incorrect amounts.

The local inbox is `.data/rakuten-report-inbox/`. A daily report placed there is imported automatically the next time `npm.cmd run night-eval` executes. You can also run `npm.cmd run import-rakuten -- --scan` from the M8 node. Re-exporting the same day replaces its previous aggregate, and a malformed CSV leaves the existing ledger intact. UTF-8 and Shift-JIS decoding are supported.

This is **not** direct API access to the Rakuten affiliate earnings dashboard. A supported unattended report-download method is still needed for end-to-end automation. The implementation does not assume that the separate Rakuten Advertising / LinkShare API is available for this Japanese Rakuten Affiliate account. The daily provisional reward may change before confirmation; `profitYen` remains unknown unless costs are provided in authoritative data.

Only **one** source should supply a given date's aggregate. The importer refuses dates that already contain records from another source. Real-world Rakuten CSV headers have not yet been validated against an actual export; validation on M8 remains required before relying on numbers.
