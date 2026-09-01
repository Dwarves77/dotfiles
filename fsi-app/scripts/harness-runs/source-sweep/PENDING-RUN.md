# Pending run — source-sweep

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`source-sweep` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior marker,
`sha256:01508f9bb2e7ca58`, was discharged by `source-sweep-run-004`.)

**What changed (2026-09-01, coordinator, after reading `source-sweep-run-004.json`):** run-004 (apply,
23:34:59Z) registered the OJ portal row correctly (`260089a9-…`, the run-003 fix) and then walked
seven days in **0.3 s** with HTTP 200 on every day, **zero act links and zero errors** — an hour after
run-003 found seven acts on the same URLs, and while a browser still rendered them. The server answered
with a page that was not the register (rate-limit or interstitial after the fourth full walk of the same
week in an hour) and the walker reported an honest-looking empty week. Two governing files changed:

1. `src/lib/sources/register-walk.mjs` — `looksLikeOjDailyView` (every genuine daily view links its
   sibling `daily-view` and carries the "Official Journal" heading); a zero-link page failing it is
   recorded as an ERROR day with the byte count and the page head as evidence; each day now records
   `bytes`. 3 tests.
2. `scripts/turns/run-source-sweep.mjs` — `politeFetch`: one request per second across all three
   walkers (`SOURCE_SWEEP_FETCH_GAP_MS`, default 1000), plus Accept headers.

`src/lib/sources/feed-walk.mjs` is unchanged.

**harness_version at write time:** `sha256:5a6a5a4649f79eec`

**The planned run that supersedes this marker:** `source-sweep-run-005.json`, a `register-eurlex`
APPLY re-walk of 2026-08-25..2026-08-31 dispatched after a pause, expected to show either the seven acts
again (with `source_id 260089a9-…`, re-pointing the seven candidate rows) or seven `unexpected page
shape` ERROR days carrying the evidence run-004 lacked. Per F28's reverse-audit, this file is deleted the
moment an artifact carrying the hash above lands.
