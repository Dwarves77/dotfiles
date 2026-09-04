# Pending run — source-sweep

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when this family's governing files (`scripts/harness-runs/governing-files.mjs`'s
`GOVERNING_FILES['source-sweep']` — `scripts/turns/run-source-sweep.mjs`,
`src/lib/sources/register-walk.mjs`, `src/lib/sources/feed-walk.mjs`) re-hash to something no artifact on
record carries. This family has 14 valid artifacts (`source-sweep-run-001` … `-014`), all recorded at
`harness_version sha256:925c102302270e6e` (the hash `LAST-PROPOSER-PASS.md`'s "Pass over
source-sweep-run-013 and -014" pass confirmed matched runs 013/014, discharging the prior marker). This
marker is the honest acknowledgment CONVENTION.md's `harness_version` design anticipates — written in the
exact format `parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed (lane SWEEP-BUDGET, 2026-09-04) [CONFIRMED by the coordinator, GitHub Actions
2026-09-04].** Source sweep #14 (`--all-hosts`, `--max-hosts 40`) took 13m24s and #15 14m57s; #16
(`--max-hosts 70`) was KILLED by `.github/workflows/source-sweep.yml`'s `timeout-minutes: 30` with **NO
artifact** — apply mode's per-source coverage stamps and candidate upserts persist per source
(`guardedUpdate`/`upsertPortalLinkCandidates`, both called once per `src` inside the loop, not batched at
the end), so the run was DB-correct but repo-blind: the coordinator had no record it ran at all. #17 (40
hosts, the next 40 thinnest-covered hosts, started 20:11 UTC) was still running at 34 minutes and would
have died the same way. `DEFAULT_MAX_HOSTS`'s own per-host arithmetic (~35s/host) is an AVERAGE — the tail
(sitemap-index fan-out, a slow host, unscoped feed-candidate probing) is unbounded, and the walk loop
(`for (const src of targets)`, `run-source-sweep.mjs`, ~line 1074 before this change) had no wall-clock
check at all.

ONE governing file (`scripts/turns/run-source-sweep.mjs` — already governing; `register-walk.mjs` and
`feed-walk.mjs` are UNCHANGED) moved bytes in this diff:

1. **`DEFAULT_TIME_BUDGET_SECONDS = 1500`** (new exported constant, next to `DEFAULT_MAX_HOSTS`) — the
   SAME arithmetic `DEFAULT_MAX_HOSTS`'s own comment already computed (workflow timeout 1800s minus a
   300s non-walk reserve). `DEFAULT_MAX_HOSTS`'s comment is updated to say the budget, not `--max-hosts`,
   is now the hard stop — `--max-hosts` stays a CEILING on how many hosts one dispatch is willing to
   attempt, never what stops a run in time.
2. **`checkTimeBudget(startedAtMs, nowMs, budgetSeconds)`** (new export) — a PURE predicate over an
   injected clock VALUE (never reads a clock itself), testable without sleeping.
3. **`walkTargetsWithinBudget(targets, walkOne, {startedAtMs, budgetSeconds, nowMs})`** (new export) — the
   ACTUAL loop `main()`'s `--walker sitemap` branch now runs (not a parallel simulation): checks
   `checkTimeBudget` before every target, never mid-target, and stops the walk when the budget is spent.
   `main()`'s `for (const src of targets)` loop is now this call. On exhaustion the run still returns
   normally and `main()` still `process.exit(0)`s — a bounded, complete unit of work, never an error. The
   result carries `budget.{budgetSeconds, elapsedSeconds, exhausted, sourcesWalked, sourcesNotReached:
   {count, ids}}`, and `shapeRunOutput`'s sitemap branch surfaces these as
   `metrics.{budget_seconds, elapsed_seconds, sources_walked, sources_not_reached, budget_exhausted}` —
   always present, not only on exhaustion. `per_item` is NEVER fabricated for an unreached source (it
   simply never enters `sourceResults`); only the count/ids are in `metrics.sources_not_reached`.
   `metrics.hosts_remaining_unwalked` (an `--all-hosts` run) is RECOMPUTED from the hosts the run actually
   walked (`hostsWalked`, already computed in `shapeRunOutput`) rather than `selectAllHostsTargets`'s own
   assume-all-selected-walked figure, which the budget can now make wrong.
4. **`withFetchTimeout(fetchImpl, timeoutMs)`** (new export) + `SOURCE_SWEEP_FETCH_TIMEOUT_MS` (new
   private constant in `main()`, default 20000ms, `SOURCE_SWEEP_FETCH_TIMEOUT_MS` env-overridable like the
   pre-existing `SOURCE_SWEEP_FETCH_GAP_MS`) — [CONFIRMED, read in full]: before this change, NEITHER this
   file's `fetchHtml`/`fetchJson`/`fetchText`/`fetchBytes` helpers (all four route through the one
   `politeFetch`) NOR `src/lib/sources/sitemap-walk.mjs` (which never calls `fetch` itself — PURE + DEP-
   INJECTED by design; every network call is the caller's injected `deps.fetchBytes`) carried an
   `AbortSignal`, a timeout, or any bound on how LONG one fetch may hang — only on how BIG the eventual
   response may be (`checkResponseBytes`, checked AFTER a full response arrives) and how MANY documents a
   sitemap walk may fetch. `politeFetch` now wraps the bare `fetch` through `withFetchTimeout` — ONE
   constant, ONE call site, every walker (register-eurlex, register-federal-register, feed, sitemap alike)
   protected, not three copies. A timeout is reported as a plain `Error` naming the timeout and the url
   (not a raw `DOMException`), which every existing string-matching error path in this family
   (`register-walk.mjs`, `feed-walk.mjs`, `sitemap-walk.mjs`'s own `error` fields) already handles
   unchanged.
5. **`--time-budget-seconds`** CLI flag (new, default `DEFAULT_TIME_BUDGET_SECONDS`, threaded from
   `.github/workflows/source-sweep.yml`'s new `time_budget_seconds` workflow input — optional, blank =
   default) and `config.time_budget_seconds` recorded on every artifact.

`.github/workflows/source-sweep.yml`, `docs/runbooks/CORPUS-TURN-RUNBOOK.md`, and
`scripts/turns/run-source-sweep.test.mjs`/`src/lib/sources/sitemap-walk.test.mjs` also changed in this
diff — none of the three is a `source-sweep` governing file (the workflow orchestrates but is not hashed,
same as every other family in this repo; the docs are prose; the tests are proofs, not behavior), so none
of them moves this family's `harness_version` on their own — only item 1-5 above (all in
`run-source-sweep.mjs`) do.

**harness_version at write time:** `sha256:447d5399c5f2946e` (was `sha256:925c102302270e6e`, the hash all
14 landed artifacts carry)

**The planned run that supersedes this marker:** the next `source-sweep-run-015.json` (or whichever number
is next once this lane's PR merges), produced by `node scripts/turns/run-source-sweep.mjs --walker sitemap
--all-hosts --max-hosts 40 --mode apply` (`--time-budget-seconds` left blank — the default 1500s). Per
F28's reverse-audit (rule (c)): once that run lands recording `harness_version sha256:447d5399c5f2946e`,
this marker is discharged and should be deleted in the SAME proposer pass that reads it (see
`LAST-PROPOSER-PASS.md`'s own discharge precedent for runs 009-011 and 013-014).

**Coordinator's exact next dispatch:** `walker=sitemap`, `all_hosts=true`, `max_hosts=40`, `mode=apply`,
`time_budget_seconds` blank (default) — resumes exactly where #15's coverage stamps left off
(`orderHostGroupsForSweep`'s resumability: the next dispatch with the same shape naturally picks up the
thinnest-covered hosts first) and is now safe to leave running the full 30-minute job: if it runs long, it
stops itself at ~1500s of walk time with an honest, complete artifact instead of being killed by the
workflow's `timeout-minutes: 30` with nothing to show. Read `metrics.hosts_remaining_unwalked` and
`metrics.budget_exhausted` from its artifact to decide whether a follow-up dispatch (same inputs) is
needed before the ⌈646/40⌉ = 17-dispatch backfill is done.
