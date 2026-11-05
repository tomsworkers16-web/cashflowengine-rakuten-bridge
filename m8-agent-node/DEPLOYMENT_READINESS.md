# M8 deployment / first-revenue readiness

Run from `m8-agent-node` in a **new** PowerShell after obtaining a reviewed GitHub revision:

```powershell
git pull
npm.cmd run check
npm.cmd test
npm.cmd run preflight
npm.cmd run verify
```

- `preflight` is read-only. It prints only credential presence flags (not token contents), local `/status` health, image-admin registration count, and operational blockers. It never posts or changes configuration.
- `verify` checks live API connectivity but does not post.
- Existing M8 processes keep running their old code until restarted. Do not blindly kill unrelated Node processes; inspect PID and command line first.
- Verify the `CFE_IMAGE_POST_ENABLED` switch stays false until approved image rights and a controlled media publishing test are completed.
- Publishing intent records in `posts.jsonl` have multiple transitions. Nightly reports count only last successful status per slot; uncertain outcomes are not sales, clicks, or confirmed posts.
- `threadsViews` are platform exposure, not profile visits; `threadsLinkClicks` are platform insights, not necessarily clicks recorded by Rakuten. Missing earnings/costs remain unknown.
- External posting is a live side effect. Do not use `npm.cmd start` with `CFE_AUTO_POST_ENABLED=true` solely to test a change: the core can publish on its next scheduled slot.
- First revenue requires an actually attributed affiliate order and reported reward, not just a Threads post or a preview image.

Unresolved: automated import of actual affiliate reward evidence, tested image publishing with verified rights, M8 deploy/restart, and production operation.
