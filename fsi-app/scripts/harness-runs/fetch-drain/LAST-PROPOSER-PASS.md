# Last proposer pass — fetch-drain

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `fetch-drain` now has **three** artifacts
(`fetch-drain-run-001`, `-002`, `-003`); F28's rule (d) requires this file to name the latest verbatim:
**fetch-drain-run-003**.

**Artifacts read:** fetch-drain-run-001, fetch-drain-run-002, fetch-drain-run-003.

**Full traces read:** `/root/work/build/fetch-error-dispositions.md` in its post-v1.6 state (the single
document carrying all three runs' per-row evidence — run-003 updated it in place with the v1.6 ladder
outcomes), plus `fetch-drain-run-003.json`'s own per_item rows and `defects_found`, and the deployed
worker source `cw-v16.ts` (sha256 `82889d10f522c40bc…` verified against `get_edge_function` at deploy,
per the F2 lane record).

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
5. `PENDING-RUN.md`'s marker is discharged exactly per its own instructions: the planned run landed as
   `fetch-drain-run-003.json` whose `harness_version` matches the marker's recorded hash — the marker is
   deleted in the same landing that adds the artifact (F28 rule (c)'s "landed artifact matches marker →
   marker is stale and must be deleted").

**Proposal:**
1. **PDF parse-compute guard investigation** — determine whether pdf.js parsing can be bounded inside the
   worker (page-count cap, worker-side timeout wrapping the parse call, or offloading PDF text extraction
   entirely) before proposing code; 2 known reproducer rows exist. Investigation-first, same posture as
   the HTTP/2 thread.
2. **HTTP/2 thread continues as scoped** — next concrete step remains an HTTP/1.1-fallback experiment
   against one `*.gov.au` reproducer, still unproposed as code pending that experiment.
3. **No further drain batches proposed**: the queue is empty; fetch-drain's next run should be triggered
   by real new intake (mint batches 002+ registering sources with fetchable documents), not by re-replaying
   a residual error set three runs have now characterized identically.

**Family gates status:** this landing adds the run artifact, deletes the discharged `PENDING-RUN.md`, and
updates this attestation — no governing-file change (`capture-worker/index.ts` on the tree already IS the
deployed v1.6 content run-003 hashed). Fitness suite incl. F28 runs in the landing train's CI.
