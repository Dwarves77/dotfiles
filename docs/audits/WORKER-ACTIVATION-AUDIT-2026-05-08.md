# Worker activation audit — 2026-05-08

**Worktree:** `agent-a5f784e82c1f47a36` off master HEAD `1340978`
**Scope:** INVESTIGATION ONLY. Read-only. No code edits. No DB writes. No PR.
**Target:** Explain why 577 of 718 active sources have produced zero `intelligence_items` since 2026-04-05.
**Reference status doc:** `docs/MONITORING-STATUS-2026-05-08.md`

---

## 1. Summary (root cause)

**The "worker" that the cron is calling is not an ingestion worker. It is an HTTP accessibility prober.** `POST /api/worker/check-sources` (file: `fsi-app/src/app/api/worker/check-sources/route.ts`) does a `HEAD` request against each source URL, updates accessibility counters, logs a trust event, and writes a `monitoring_queue` row with `change_detected: false` hard-coded. **It never fetches content, never invokes the agent, never inserts into `intelligence_items`.** No matter how many sources the worker visits, it will produce zero intelligence items, because production of intelligence items is gated behind `/api/agent/run`, which has no cron in this repo. The 577-source ingestion gap is therefore not a "scheduling reach" gap — it is an "ingestion path is not wired to a cron at all" gap. Compounding this: even the accessibility prober is rate-shaped to revisit the same Tier-1 sources every cycle (LIMIT 10, ORDER BY tier ASC, with `next_scheduled_check` rolled forward by each source's `update_frequency`), so high-cadence T1 sources monopolize every run and the long tail is starved.

---

## 2. What the worker actually does (per-invocation flow)

`POST /api/worker/check-sources` (route.ts:24-147):

1. **Auth gate.** Compare `x-worker-secret` header to `WORKER_SECRET` env. 401 if mismatch. (route.ts:26-29)
2. **Global pause gate.** `isGloballyPaused(supabase)` — query `system_state.global_processing_paused`. Short-circuit if true. (route.ts:34-36)
3. **Source selection.** SELECT 10 sources from `sources` (see §3 for exact algorithm). (route.ts:40-47)
4. **Per-source loop:**
   - Fire a 10-second-timeout `HEAD` request with UA `CarosLedge-Monitor/1.0`. (route.ts:62-72)
   - Update the source row: `last_checked`, `next_scheduled_check`, accessibility counters (`last_accessible`/`last_inaccessible`/`consecutive_accessible`/`successful_checks`/`total_checks`), and flip `status` between `active` ↔ `inaccessible` based on the HEAD result. (route.ts:78-101)
   - Insert a `source_trust_events` row of type `accessibility_check`. (route.ts:104-113)
   - Insert a `monitoring_queue` row with `last_result: 'no_change' | 'inaccessible'` and **`change_detected: false` (hard-coded)**. (route.ts:116-124)
5. Return `{ message: 'Checked N sources', checked: N, results: [...] }`.

**What is missing from this flow:**
- No GET of source content. HEAD only.
- No content hashing, no diff against prior content, no `last_substantive_change` write.
- No call to `/api/agent/run` to regenerate a brief.
- No insert into `intelligence_items`. **The worker has no path to producing a single intelligence item under any circumstance.**
- The "monitoring_queue" insert with `change_detected: false` makes it look like the worker decided no change occurred. It didn't decide — it never looked.

For comparison, `POST /api/data/scan-all` (route.ts in `src/app/api/data/scan-all/route.ts`) does fetch content via `browserlessRender()` and is the would-be ingestion worker, but: (a) it requires a user JWT (`requireAuth`), not a worker secret, so cron cannot call it; (b) it is not referenced by any GitHub Actions workflow, Vercel cron, or other scheduler in this repo; (c) it still doesn't write `intelligence_items` — it only updates source `last_checked`/`last_accessible` and returns a content blob.

The only path in this codebase that writes `intelligence_items.full_brief` is `POST /api/agent/run`, which is also unscheduled (manual admin trigger only, per CLAUDE.md "Permitted live Claude API calls" table).

---

## 3. Source-selection algorithm (exact)

`route.ts:40-47`:

```
SELECT id, name, url, tier, update_frequency, last_checked, access_method
FROM sources
WHERE status = 'active'
  AND processing_paused = false
  AND (next_scheduled_check IS NULL OR next_scheduled_check <= NOW())
ORDER BY tier ASC
LIMIT 10
```

**Key properties:**
- **Tier-priority ordering with no tiebreaker.** Every cycle, the 10 lowest-tier-numbered sources whose `next_scheduled_check` has elapsed are picked. Postgres breaks the tie arbitrarily on `tier`-only ORDER BY, but in practice the same set of T1 sources (which are most numerous and have the shortest `update_frequency` reschedule) keeps reappearing.
- **No randomness, no `last_checked` ordering as a secondary key.** A T1 source with `update_frequency='continuous'` (1h reschedule, route.ts:152) becomes due again 1 hour after every check. Cron fires every 6 hours (see §4). So every cron firing finds those continuous T1 sources due again, refills the 10 slots from the T1 pool, and never reaches T2+.
- **No `admin_only` filter.** Sources with `admin_only=true` are not excluded — minor, but worth noting.
- **No `last_substantive_change` consideration.** Whether the source has ever produced an item is irrelevant to selection.

---

## 4. Why the 577 zero-ingestion sources are not visited (and would not produce items even if they were)

**Two compounding gaps, in order of importance:**

### Gap A — there is no ingestion path on cron at all (root cause)

`/api/worker/check-sources` is HEAD-only. It cannot produce items. It is the only worker route on cron. Therefore: **no source can ever produce an `intelligence_items` row from cron alone.** The 39 sources that have items in the last 28 days produced them through manual `/api/agent/run` invocations or pre-cutoff bulk runs (e.g., the B.2 runner referenced in CLAUDE.md), not from the cron. The 184 active items in the platform are residuals of those manual runs, not output of the scheduled pipeline.

This is the single explanation for the 577-source zero-ingestion population. Fixing reach would do nothing without also wiring a content-fetch-and-regenerate path to cron.

### Gap B — even the HEAD prober's reach is starved (compounding)

Cron fires 4×/day (every 6h) × LIMIT 10 = 40 source-visits/day. With 718 active sources and the algorithm in §3, the steady state is:

- T1 sources with `update_frequency` of `continuous` (1h), `business-daily` (24h), `daily` (24h) make themselves perpetually re-due. There are ~316 T1 sources zero-ingestion alone, plus the 84 T1 sources that did produce items, so >400 T1 sources are competing for slots.
- At each cron firing, the WHERE clause `(next_scheduled_check IS NULL OR ... <= NOW())` matches every never-checked source AND every recently-checked T1 with short reschedule. ORDER BY tier ASC then drains the T1 pool first.
- The 577 zero-ingestion sources all share `next_scheduled_check IS NULL` (because they've never been checked → the `getNextCheck` write only happens on visit), so they're eligible. They just never get to the front of the tier-sorted line because the same T1 churn cohort cycles back ahead of them every 6 hours.

So the prober is *starving* the long tail too. But this is secondary: even fixing reach would only update accessibility counters on those 577 sources, not turn any of them into intelligence_items, because the prober has no ingestion path.

---

## 5. Schedule + concurrency

- **Schedule:** `cron: '0 */6 * * *'` from `.github/workflows/source-monitoring.yml:17` — every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC. Also `workflow_dispatch` for manual.
- **Concurrency:** 1 job per firing (`runs-on: ubuntu-latest`, no matrix). Per firing, the route processes the 10 selected sources sequentially in a `for` loop with no `Promise.all`. Per-source HEAD timeout = 10s. Realistic per-firing wall time: 30-90s.
- **Per-firing budget:** 10 sources. **Per-day budget:** 40 source-visits. **Per-week budget:** 280. **Theoretical full-registry sweep at this rate (if reach were uniform):** 718 / 40 = 17.95 days. Empirically much worse because of the tier-starvation pattern in §3.
- **Other crons in this repo (`.github/workflows/`):**
  - `trust-recompute.yml` — monthly at 03:00 UTC on the 1st. Hits `/api/admin/recompute-trust`. Recomputes trust scores; does not ingest.
  - `spot-check-monthly.yml` — monthly at 03:00 UTC on the 1st. Hits `/api/admin/spot-check/recurring`. Source-promotion calibration; does not ingest.
  - **No cron points to `/api/agent/run` or `/api/data/scan-all`.** No ingestion is scheduled.

---

## 6. Pause-flag state

Pause helpers live at `src/lib/api/pause.ts`. Two flags exist (per migration 016):

- **Global:** `system_state.global_processing_paused BOOLEAN`. Singleton row enforced by `BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true)`. Default `false`.
- **Per-source:** `sources.processing_paused BOOLEAN`. Default `false`.

Both helpers (`isGloballyPaused`, `isSourcePaused`) gracefully degrade to `false` (unpaused) if the table/column is missing or RLS-blocked. The worker checks the global gate at route.ts:34-36 and filters per-source via `.eq('processing_paused', false)` at route.ts:43.

**Live state of these flags is a live-DB question** that this read-only audit cannot answer with full certainty without a service-role query. However, the empirical evidence in `docs/MONITORING-STATUS-2026-05-08.md` (39 sources produced items in the last 28 days, including high-cadence T1 sources like California Leginfo, EUR-Lex, IRENA, IEA, NREL) confirms **the global flag is NOT set to true** — if it were, no source would have moved at all. Per-source pause is more uncertain but is implausible as the cause of the 577-source gap (it would require 80% of the registry to be individually paused, which contradicts the registry-creation premise in MONITORING-STATUS-2026-05-08.md §3).

**Verdict:** pauses are not the cause.

---

## 7. Monitoring column state

Per migration 004 (`004_source_trust_framework.sql:44-75`), the `sources` table has rich monitoring columns:

| Column | Purpose | Worker writes? |
|---|---|---|
| `last_checked` | Last accessibility check | YES (every visit) |
| `last_substantive_change` | Last detected content change | **NO** (worker never checks content) |
| `next_scheduled_check` | Next due time (drives selection) | YES (rolled forward by `update_frequency`) |
| `last_accessible` | Last successful HEAD | YES |
| `last_inaccessible` | Last failed HEAD | YES |
| `consecutive_accessible` | Streak counter | YES |
| `total_checks` | Lifetime check count | YES |
| `successful_checks` | Lifetime success count | YES |
| `accessibility_rate` | Cached % | **NO** (denormalized but never recomputed by worker) |

What's missing for ingestion observability:
- **No `last_scanned_at` or `last_scan_status` or `last_scan_item_count` column.** The 577-vs-141 split has to be reconstructed by joining `intelligence_items` against `sources` and counting; there's no per-source scoreboard column to read in the registry UI.
- **No content hash column on `sources`** to support "have we seen this content before?" change detection. `monitoring_queue.change_detected` is the only signal and it is hard-coded `false` by the worker (route.ts:121), making the field meaningless.

What would help:
- A single column `sources.last_intelligence_item_at TIMESTAMPTZ` (or computed view) so the registry UI and dispatch agents can directly query "sources with no item since creation" without joining intelligence_items every time.
- A `sources.content_hash TEXT` + `sources.content_fetched_at TIMESTAMPTZ` pair for real change detection.

---

## 8. Proposed fix

**Two changes, in priority order.**

### Fix 1 — wire ingestion to cron (the actual fix; M effort)

Today's cron calls a HEAD-only prober. The fix is to either:
- **Option 1A (minimal-shape):** Extend `/api/worker/check-sources` to, for each accessible source, fetch content (via `browserlessRender()` for `scrape` access_method, or the existing API-handler logic from `scan-all` for `api`), hash it, compare against a new `sources.content_hash` column, and on change call `/api/agent/run` internally (or stage a job into a new `regeneration_queue` table for a separate budget-aware consumer). Keep the HEAD-only behavior on the same route as a fast path for inaccessible sources.
- **Option 1B (separate route):** Add a new `POST /api/worker/scan-and-regenerate` with worker-secret auth, accepting a small batch (e.g., 5 sources/run with a longer timeout), wired to a new GitHub Actions workflow at a slower cadence (e.g., every 4h or daily). Keep the existing prober as-is for fast accessibility cycling. This is closer to the existing route hygiene.

Both options need:
- A budget knob (per-run source count, per-source timeout) because Claude API spend per regeneration is real.
- An ORDER BY change to `ORDER BY last_substantive_change ASC NULLS FIRST, tier ASC` (or similar) so zero-ingestion sources rotate to the front instead of being starved.
- A `last_substantive_change` write when content changes, so the next sweep reaches a different cohort.

**Expected ingestion-rate impact:** If the new path runs against 5 zero-ingestion sources per 4h cycle = 30/day = 19 days to walk all 577. With workspace concurrency on a longer cron and dispatch-agent dispatch as a manual top-up, the 80% gap closes in 3-4 weeks.

**Effort estimate: M.** Net-new route + new workflow yaml + content-hash column migration + an ingestion budget contract. ~2-3 days of focused work plus a verification phase against a 10-source pilot before scaling.

### Fix 2 — fix selection-fairness on the existing prober (S effort)

Independent of Fix 1, change the ORDER BY on the HEAD prober from `tier ASC` to `last_checked ASC NULLS FIRST, tier ASC`. This prevents T1 churn from monopolizing every cycle and gets accessibility coverage on the long tail.

**Expected impact:** Modest. Improves accessibility-data freshness for the 577 long-tail sources, but does not by itself produce intelligence_items (Gap A is the real fix). Useful as a same-PR companion change.

**Effort estimate: XS.** One line in the SELECT, one PR, no migration.

### Combined recommendation

Ship Fix 2 alongside Fix 1 — Fix 2 is free and restores the prober's stated intent. Fix 1 is the work that closes the 577-source gap.

---

## 9. Halt conditions surfaced

- **Architectural-redesign signal:** Fix 1 is genuinely architectural — it commits the platform to a content-fetch-and-regenerate cron path with a Claude API budget contract. Today's design treats every regeneration as an admin-triggered manual action (per CLAUDE.md "Permitted live Claude API calls" table). Cron-driven regeneration changes the cost model. **This is a Jason-level decision, not an in-place autonomous fix.** A 5-source-per-4h cadence at $0.15/regeneration = ~$135/month at full saturation if every probe finds change; lower in steady state.
- **No third-party-infrastructure halt.** GitHub Actions, Vercel, and Supabase are all operating as configured. The cron is firing on schedule; the route is responding 2xx; no infra is in the way.
- **Worker route is approximately as expected.** No major refactor since dispatch context was written. HEAD-only prober is the current shape — that is itself the finding.

---

## Files referenced

- `fsi-app/src/app/api/worker/check-sources/route.ts` — the worker route (HEAD prober)
- `fsi-app/src/app/api/data/scan-all/route.ts` — content-fetching route (auth-required, no cron)
- `fsi-app/src/app/api/agent/run/` — the only intelligence_items writer (no cron)
- `fsi-app/src/lib/api/pause.ts` — pause-flag helpers
- `fsi-app/supabase/migrations/004_source_trust_framework.sql` — sources schema
- `fsi-app/supabase/migrations/016_add_processing_pause.sql` — pause flags
- `.github/workflows/source-monitoring.yml` — the cron (every 6h)
- `.github/workflows/trust-recompute.yml` — monthly trust recompute (not ingestion)
- `.github/workflows/spot-check-monthly.yml` — monthly spot-check (not ingestion)
- `docs/MONITORING-STATUS-2026-05-08.md` — context: 577/718 zero-ingestion, 39/718 active in last 28d
