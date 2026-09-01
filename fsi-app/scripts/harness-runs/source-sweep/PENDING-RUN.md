# Pending run — source-sweep

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`source-sweep` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it, per that rule's own escape hatch.
(The marker written for the driver's first landing, `sha256:87e06e9784e8e21b`, was discharged by `source-sweep-run-001`,
which carries exactly that hash; this file replaces it for the change below.)

**What changed (2026-09-01, coordinator, after reading `source-sweep-run-001.json` against the live
EUR-Lex site):** two of the three governing files.

1. `src/lib/sources/register-walk.mjs` — `walkEurlexOj` now (a) keeps only OJ act links
   (`/legal-content/` or `/eli/` in the path; `ojActLinksOnly`), because the generic
   `extractPortalLinks` accepted the daily view's site chrome ("Regulations", "Legal notice", "Official
   Journal C series daily view", …) and run-001 reported 31–32 "extracted" links per day against an
   edition (28 August 2026) that lists 2 acts; (b) detects a day EUR-Lex answers with an already-walked
   edition (the site serves the LAST PUBLISHED edition for a weekend `ojDate`; Sunday 30 August rendered
   the 28 August edition) and records it as `duplicate_of` with 0 extracted instead of re-persisting;
   (c) records each day's act `urls` in the raw result so a dry run is auditable from the repo.
2. `scripts/turns/run-source-sweep.mjs` — `started_at` is stamped before the walk (run-001's was stamped
   inside `finally`, i.e. at finish time) and `finished_at` is now written; dry-mode verdicts say
   "planned (dry, nothing written)" instead of "upserted" (run-001 read "221 upserted" for a run that
   wrote 0 rows); `metrics.mode` and `days_duplicate_edition` added.

3. `scripts/turns/run-source-sweep.mjs` (same file) — the raw walker result is now written to
   `scripts/harness-runs/source-sweep/traces/<run_id>.raw-result.json` (`defaultTraceDir`), one level
   below the family directory. Run-001 wrote it beside its artifact and F28 correctly rejected the trace
   as an INVALID ARTIFACT (every family-level `*.json` is an artifact by CONVENTION.md); run-001's trace
   file was moved to `traces/` in this landing (its artifact's `full_trace_refs`, an absolute runner
   path, is left as written — a landed artifact is never edited).

`src/lib/sources/feed-walk.mjs` is unchanged.

**Why run-001 stands and is not rewritten:** it is the honest record of what the driver did on
2026-09-01T22:31Z — a real network walk of seven daily views in dry mode that wrote nothing. Its numbers
are wrong in the two ways above, and this marker plus the next artifact are how the family records that,
per CONVENTION.md (a landed artifact is never edited).

**harness_version at write time:** `sha256:7df464313565f9b4`

**The planned run that supersedes this marker:** `source-sweep-run-002.json`, a `register-eurlex` DRY
re-walk of the same 2026-08-25..2026-08-31 range via `.github/workflows/source-sweep.yml`, expected to
show `days_duplicate_edition = 2` (29 and 30 August) and single-digit `extracted` per weekday. Once that
matches, the first APPLY walk follows. Per F28's reverse-audit, this file is deleted the moment an
artifact carrying the hash above lands.
