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

## One-command verification on M8 (does not publish)

When the M8 machine becomes accessible, run in PowerShell from
`C:\\AI-Factory\\cashflowengine-rakuten-bridge\\m8-agent-node`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-And-Check.ps1
```

The script stops on uncommitted tracked edits, wrong branch, missing local `.env`,
failed fast-forward, failed tests, or failed API verification. It deliberately does
not restart the M8 core, edit secrets, publish Threads posts, or enable auto-post.
After checks, inspect existing service processes before a separate controlled restart.

## Optional Windows unattended startup

`Run-M8-Core.ps1` supervises the local Node core. If it exits unexpectedly, the watchdog restarts it after 30 seconds, logging to `.data/logs/m8-core.log`. It does not change settings, enable posting, or connect to a new service.

`Install-M8-Startup.ps1` creates one shortcut in the **current Windows user's Startup folder**. It must be run once by that user, after the M8 tests are complete and the core has been stopped. There is no administrator requirement. The agent then starts when this Windows user logs on, **not** before login or during Windows sleep.

Run only after confirming the configuration:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-M8-Startup.ps1
```

If another process already owns the core port, the watchdog exits without launching a duplicate core. Remove the Startup shortcut named `Cash Flow Engine M8.lnk` to disable automatic start. This is a user-login startup option, not an always-on Windows service. Power loss, hibernation and unavailable internet still require operational monitoring.
