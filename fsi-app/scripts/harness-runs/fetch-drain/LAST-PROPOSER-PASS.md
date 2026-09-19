# Last proposer pass — fetch-drain

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `fetch-drain` now has **five** artifacts
(`fetch-drain-run-001` through `-005`); F28's rule (d) requires this file to name the latest verbatim:
**fetch-drain-run-005**.

## Lane m1 follow-up (2026-09-18): fetch-drain-run-005, a hash-refresh re-run after F45/F39/F47

**What this pass is, honestly.** `fetch-drain-run-005` is a second `--mode dry` run of the SAME runner
that produced run-004, re-run once the pre-push gate's F45 (duplicate-code), F39 (unbounded-in-filter),
and F47 (db-object-reference) remediations landed (`scripts/lib/run-artifact.mjs` gained
`validateModeArg`/`baseArtifactFields`, imported into `run-fetch-drain.mjs` in place of the inline
duplicate; the batch read-back now goes through `db.mjs`'s `readAllByIds` instead of a bare `.in()`).
Those edits moved `GOVERNING_FILES['fetch-drain']`'s own hash (the runner's content changed), so run-004's
`harness_version` no longer matched the current tree; run-005 exists to re-discharge that staleness
coupling, not to add a new observation. It made no HTTP call (dry mode) and changed no row:
`queued_selected=8`, `stuck_selected=0`, matching run-004's own read (the queue's `queued_at` ordering is
unaffected by any of the day's code fixes). The hypotheses and proposal below carry forward from run-004
unchanged; nothing new was found in the ~15 minutes between the two dry reads.

## Lane M1 (2026-09-18, build plan section 6.1 row M1): fetch-drain-run-004, a mechanism-proving dry run

**What this pass is, honestly.** `fetch-drain-run-004` is the FIRST run of the new canonical runner,
`scripts/turns/run-fetch-drain.mjs` (this lane), invoked once locally in `--mode dry` (read-only: SELECT
the queued rows, oldest first, limit 8; SELECT the stuck rows, none found). It proves the runner reads
the same tables the three hand-run pg_net drains (001-003) did and shapes a valid CONVENTION.md artifact,
nothing more. It is NOT a new investigative pass over the error classes runs 001-003 characterized (no
HTTP call was made; dry mode makes none); the hypotheses below are scoped to that difference, not restated
from the prior pass.

**Artifacts read:** fetch-drain-run-001, fetch-drain-run-002, fetch-drain-run-003, fetch-drain-run-004.

**Full traces read:** `/root/work/build/fetch-error-dispositions.md` in its post-v1.6 state (the single
document carrying runs 001-003's per-row evidence), plus `fetch-drain-run-003.json`'s own per_item rows
and `defects_found`, and the deployed worker source `cw-v16.ts` (sha256 `82889d10f522c40bc...` verified
against `get_edge_function` at deploy, per the F2 lane record). For run-004:
`scripts/harness-runs/fetch-drain/traces/fetch-drain-run-004.raw-result.json` (the raw queued/stuck row
selection) and `fetch-drain-run-004.json`'s own per_item (8 `planned_queued` rows, 0 stuck).

**Hypotheses (verified against run-003, not taken on its word):**
1. The prior pass's proposal 1 (deploy v1.6) is **DONE**: worker deployed as function version 8,
   content-hash-verified, and the ladder rerun confirms the fix's mechanism — the 4 rows that previously
   HUNG the worker (v1.5's no-timeout design) now fail as clean 45-second `AbortSignal.timeout` errors.
   The timeout defect class is closed as diagnosed (host-level TCP stall, not PDF-specific).
2. The prior pass's proposal 2 (HTTP/2 investigation) remains **OPEN**, now with a third confirming
   replay: the 12 `http2 stream error` rows (10 `*.gov.au`, `fred.stlouisfed.org`,
   `pollution-waste.canada.ca`) are byte-identical across three runs. Connection-layer, v1.6 correctly
   did not touch it. `fix_ref: null` stands.
3. **New defect class this cycle, not covered by any prior proposal:** `WORKER_RESOURCE_LIMIT` — pdf.js
   parse-time compute exhaustion (2 rows: regulations.gov + lacity.gov PDFs), which kills the isolate
   BEFORE the pre-buffer size guard can apply (the guard bounds bytes buffered, not parse CPU). v1.6 was
   never scoped to fix it; recorded in run-003's `defects_found` with root cause.
4. The queue itself is fully drained: 1,235 done / 136 error / 5 skipped / 0 queued / 0 fetching. Net new
   captures from the v1.6 ladder: 0 — the residual error set is dominated by classes outside v1.6's scope
   (403/404/HTTP2/DNS/TLS) plus the new PDF-compute class. Basis for all four: read run-003 +
   dispositions doc in full; the deploy and ladder were executed by the F2 lane this session (ran it, that
   lane's transcript is the primary record).
5. `PENDING-RUN.md`'s marker (as of run-003) was discharged exactly per its own instructions: the planned
   run landed as `fetch-drain-run-003.json` whose `harness_version` matched the marker's recorded hash,
   so the marker was deleted in that same landing (F28 rule (c)'s "landed artifact matches marker,
   marker is stale and must be deleted").
6. **Run-004, this lane:** the queue read live (2026-09-18) shows 8 `queued` rows (oldest `queued_at`
   2026-09-01T10:08:56Z) and 0 `fetching` rows past the one-hour stuck cutoff, consistent with hypothesis
   4's "queue fully drained" read from run-003 plus normal accrual since (new sources auto-enqueue via
   migration 065's trigger). This run made no HTTP call and changed no row, so it neither confirms nor
   refutes anything about the still-open HTTP/2 or PDF-compute-exhaustion classes above; it exists to prove
   the new runner's read path and artifact shape, ahead of the coordinator's first `--mode apply` dispatch.
   `GOVERNING_FILES['fetch-drain']` gained this lane's runner (`scripts/turns/run-fetch-drain.mjs`) as a
   second entry alongside `capture-worker/index.ts`; run-004's own `harness_version`
   (`sha256:8798fd9745d2c458`) matches that new hash exactly, so F28 rule (c)'s staleness coupling this
   lane's governing-files edit opened is discharged by this same artifact, no separate `PENDING-RUN.md`
   needed for it.

**Proposal:**
1. **PDF parse-compute guard investigation** — determine whether pdf.js parsing can be bounded inside the
   worker (page-count cap, worker-side timeout wrapping the parse call, or offloading PDF text extraction
   entirely) before proposing code; 2 known reproducer rows exist. Investigation-first, same posture as
   the HTTP/2 thread. Still open; run-004 made no new observation here (dry mode, no HTTP call).
2. **HTTP/2 thread continues as scoped** — next concrete step remains an HTTP/1.1-fallback experiment
   against one `*.gov.au` reproducer, still unproposed as code pending that experiment.
3. **The coordinator's first `--mode apply` dispatch of `run-fetch-drain.mjs`** is the concrete next step
   this lane proposes: 8 queued rows are ready now, batched in one HTTPS call of 8 (this family's own
   batch size), which will also generate the first real evidence of whether the new runner's read-back
   shaping (`shapeBatchPerItem`) is honest against a live capture-worker response, not only against this
   lane's own fixtures.

**Family gates status:** this landing adds `fetch-drain-run-004.json` (dry, mechanism-proving), extends
`GOVERNING_FILES['fetch-drain']` and `CONVENTION.md`'s matching table row to include the new runner, and
re-pins `scripts/harness-runs/meta-harness/PENDING-RUN.md` (self-referential: `governing-files.mjs` and
`CONVENTION.md` are both `meta-harness` governing files, so registering the runner moved that family's own
hash too, per that file's own documented mechanism). F28 runs green against this tree with this attestation
update included (verified locally, `node --test .discipline/fitness/functions/F28-harness-run-integrity.test.mjs`).
