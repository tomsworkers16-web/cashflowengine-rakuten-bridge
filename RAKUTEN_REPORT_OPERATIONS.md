# Rakuten Affiliate Report Operations

## Purpose
Minimize recurring automation cost while preserving daily visibility into affiliate performance.

## Operating policy
1. The user checks Rakuten Affiliate performance directly in the Rakuten management screen as part of daily awareness.
2. The official Rakuten Affiliate CSV is the canonical machine-readable source for performance data.
3. If an official CSV covering the latest period has been provided to the Cash Flow Engine project/conversation within the last 3 days, automation must use that CSV and must not launch TinyFish for Rakuten reporting.
4. If no such CSV has been provided for 3 days or more, and no TinyFish report fetch has occurred within the same 3-day window, TinyFish may be used once as a fallback to download the official Rakuten Affiliate report CSV.
5. TinyFish must prioritize a single direct report/CSV retrieval flow and avoid unnecessary page navigation.
6. Do not fetch the same report period more than once in the same run.
7. Product search, item metadata, scoring, and affiliate URL generation must never use TinyFish. These remain on Rakuten official APIs / the existing Rakuten bridge.
8. If TinyFish has insufficient wallet balance, do not request top-up for routine reporting. Mark affiliate performance data as unavailable until a manual CSV is provided or a later fallback becomes possible.
9. A manual visual check of the Rakuten dashboard does not count as machine-ingested data unless the corresponding CSV is provided to the project/conversation.

## Cost-control principle
Preferred order:

Official API / existing bridge -> manually supplied official CSV -> TinyFish fallback

The goal is not maximum automation percentage. The goal is maximum final profit after automation costs.

## Reporting cadence
- Human awareness: daily dashboard check as desired by the user.
- Machine ingestion: whenever a new CSV is supplied.
- TinyFish fallback: only after 3 days without a supplied CSV, maximum one fallback fetch per 3-day gap.

## Attribution
Threads metrics may be exact at post level. Rakuten affiliate results may not contain a stable identifier that uniquely maps every order to a specific Threads post. When a deterministic link identifier is unavailable, post-level affiliate attribution must be labeled as estimated, not exact.
