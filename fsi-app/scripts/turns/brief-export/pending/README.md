# brief-export/pending -- the automatic brief-authoring queue (task 3.5)

W9 brief-chain plan Part 3, task 3.5: "every new item is queued for a brief automatically." This
directory holds the numbered export parts `run-population-flywheel.mjs`'s own step 12 (`brief-export`,
see `scripts/mint/MINT-RUNBOOK.md` section 8) writes after every population turn that mints at least one
item -- each part is exactly what `export-corpus-for-extraction.mjs --with-pool-text --char-budget`
already produces for a batch (task 3.1): a stub item's stored claims/sections plus its FULL captured
`agent_run_searches` pool text, `pool: [{url, text}]`, so a session lane can author a real brief without
re-fetching.

This README's own presence keeps this directory tracked even when no part file has landed here yet (git
does not track an empty directory on its own), and is the reason `population-turn.yml`'s commit step can
safely `git add` this path on every run, whether or not step 12 wrote anything this time.

## Why a tracked path here, not `scripts/_snapshots/`

`scripts/_snapshots/` is gitignored (root `.gitignore`), so a file written there never reaches `origin` on
its own. `pending/` is a normal, tracked directory for exactly the reason `scripts/turns/record-briefs/`
and `scripts/turns/ledger-verdicts/` already are (see those directories' own READMEs): a
`workflow_dispatch` checkout only sees `origin`, and this queue exists to be picked up by a LATER session
lane, possibly in a different dispatch entirely.

## How a file lands here

`run-population-flywheel.mjs`'s `brief-export` step (step 12) writes
`scripts/turns/brief-export/pending/<mint-run-id>.json`, which `export-corpus-for-extraction.mjs`'s own
`--with-pool-text` numbering expands into `<mint-run-id>-part<N>.json` (an item larger than the char
budget goes alone in its own part, flagged `oversize: true`). `.github/workflows/population-turn.yml`'s
existing "Commit the mint + forward-events harness-run artifacts" step also adds this directory, so the
parts land on that run's own artifact branch through the SAME transport, no second one.

## How the queue is drained

`population-report.mjs`'s "briefs pending" entry (task 3.5) shows the live queue size and its own exact
red predicate. A session lane reads a pending part, authors full briefs per item under
`scripts/turns/record-briefs/README.md`'s own contract (task 3.2), and hands the resulting
`record-briefs-NNN.json` batch to `scripts/turns/apply-record-briefs.mjs` (task 3.4), which is what
actually clears an item from "briefs pending" (a recorded brief-apply outcome, success or failure, in
`scripts/harness-runs/brief-apply/`).
