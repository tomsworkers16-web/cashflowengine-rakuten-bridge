# One-shot first affiliate publication

This is an explicitly requested **single public Threads text post** for `rakumitsu_select`. No scheduled posting or external replies are enabled.

The one-shot tool performs these checks before attempting publication:
- local core health endpoint available at 127.0.0.1:18787, with both automated posting and external replies disabled;
- Threads credentials available; official timeline has fewer than `CFE_MAX_POSTS_PER_DAY` posts today;
- local journal has no prior attempt for today's manual revenue slot and no unresolved pending submissions;
- a fresh eligible Rakuten item with a full HTTPS affiliate URL can be retrieved;
- copy is within 500 characters, has the mandatory PR/affiliate disclosure and does not show known mojibake signatures;
- no identical text is present in the local journal or official Threads timeline.

A `pending` journal entry is written **before** the Threads POST. There is only one POST request, with no automatic retry on timeout. An uncertain result must be reconciled against the official Threads timeline manually; **do not rerun or delete the journal to retry**.

After updating to the version containing this feature, with the currently running M8 agent left running in the disabled configuration, preview without posting:

```powershell
npm.cmd run preview-one
```

To publish one real public affiliate text post **after reviewing the preview**:

```powershell
npm.cmd run publish-one
```

The posting command prints the selected product details and the full proposed text, then submits once. Running the command again on the same JST day fails closed. It does not change `.env`, enable the schedule, or enable automatic external replies. Image posting is not used. Publishing must be performed on the intended M8 account machine, using local credentials and local journal.

**Known limitations:** report scraping/automated earnings data retrieval is separate and not yet fully automated; the one-shot function tests API posting, not downstream affiliate conversion or commission attribution.
