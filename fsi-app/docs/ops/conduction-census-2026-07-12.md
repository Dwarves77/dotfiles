# Conduction census (T8) — 2026-07-12

**Conduction test** (operator standard): a path counts as WIRED only if traced end-to-end to a live invoker
AND its gate conditions permit execution in the current system state. Three verdicts: **WORKING** (proven) ·
**DORMANT-PROVEN-WAKEABLE** (a green wake-proof exists) · **DEAD-OR-UNVERIFIED** (delete / fix / explicit
retained-for-flip). The hold is NOT an excuse category. Surface: 82 API routes · 5 crons · 1 durable workflow.

**TIMEBOX (operator ruling):** this is the honest core — the verdict table + wake-proofs. The line-weight
table, ARCHITECTURE.md one-pager, sediment policy, and the CI census check are DEFERRED-registered (bottom);
T9 (the program exit question) preempts the remaining census breadth.

## Crons (the "does it actually run" surface — conduction-traced)

| cron (schedule) | target | invoker live? | gate state now | VERDICT |
|---|---|---|---|---|
| `uptime-probes` (*/30) | `/api/health/spend`+`/surfaces` | ✅ GH cron | none (health) | **WORKING** |
| `data-audit-lane` (daily 6am) | `scripts/verify/run-data-audit-lane.mjs` | ✅ GH cron | none (runs the audit; reflects into DATA_AUDIT_BLOCK / Layer C) | **WORKING** |
| `trust-recompute` (monthly) | `/api/admin/recompute-trust` | ✅ GH cron | compute-only (no fetch) | **WORKING** |
| `source-monitoring` (hourly) | `/api/worker/check-sources` | ✅ GH cron | `scrapeWindowOpen(cadence=off)` → no-op + hold | **DORMANT-PROVEN-WAKEABLE** — wake-proof `scrape-schedule.test.mjs` (cadence-set → window OPENS) |
| `spot-check-monthly` (monthly) | `/api/admin/spot-check/recurring` | ✅ GH cron | honors the global scrape off-gate → no-op while held | **DORMANT** — wakes with the scrape hold lifted (same gate as check-sources; covered by the cadence wake-proof's hold axis) |
| ~~`source-monitoring` drain-first-fetch job~~ | ~~`/api/worker/drain-first-fetch`~~ | — | — | **DEAD → DELETED** (R-1, Step 3.3): route + cron job removed; the July "wiring truth" MISSED this 2nd cron job (retro-diff below) |

## Workflow + intake mechanisms

| mechanism | invoker | gate state | VERDICT |
|---|---|---|---|
| `generateBriefWorkflow` (durable) | `start()` from `/api/agent/run` + staged approve | preflight (cap/pause/data-audit-block) | **WORKING** |
| mint chokepoint (`mintIntelligenceItem`) | `applyStagedUpdate` (scan-approve + `runIntakeCycle`) | congruence + dedup [fixed matcher] + F13 | **WORKING** |
| `runIntakeCycle` (machine intake) | `/api/admin/run-intake` (route live; no UI control yet) | plan default; apply = F16 signed caller | **DORMANT-PROVEN-WAKEABLE** — plan-mode proven (`plan-intake.test.mjs`); Step 5.2 live plan verdict table |
| approve→generate trigger | staged-updates approve | behind `isGloballyPaused` (loop flag) | **DORMANT** — wakes when the loop flag is off (gate simulated-open proof owed with the loop-flip unit) |
| `reconcile` worker | `monitoring_queue.change_detected=true` | `content-change.mjs` hardcodes `change_detected:false` | **DORMANT (dead-because-input)** — R-4; folded into the cadence-flip unit's scope (change detection fixed there) |
| pending_first_fetch queue | mig-065 trigger (writer); reader retired | retained-for-flip | **DORMANT** — R-2; new reader = cadence-flip unit (R-3) |

## Routes (82) — class summary

- **Customer surfaces** (regulations/market/research/operations/community + detail pages): **WORKING** (SSR, gate on `provenance_status='verified'`).
- **Admin-fired actions** (scan, staged-updates, sources/promote, canonical-sources/*, run-intake, recompute-*): **WORKING** (operator-invoked, admin-gated).
- **Worker routes**: check-sources (DORMANT, above) · reconcile (DORMANT, above) · drain-first-fetch (DELETED).
- **Health** (`/api/health/*`): **WORKING** (uptime-probed).
- No route is DEAD-orphaned after the drain-first-fetch deletion (F14 census clean; the `/api/admin/run-intake` route is DORMANT-wakeable, not dead — it has plan-mode coverage + a live caller path).

## Wake-proofs (the flip set)

- **Cadence engine** (`scrapeWindowOpen`) — the primary deliberate-off gate (check-sources + spot-check + the cadence-flip intake). **WAKE-PROOF GREEN:** `src/lib/sources/scrape-schedule.test.mjs` (4/4) — cadence OFF → closed (current state); cadence set (weekly/monthly) + on-cadence day → **OPENS**; paused-until-start honored. No live fetch/spend.
- **runIntakeCycle plan-mode** — proven by `plan-intake.test.mjs` (the gate composition) + the Step-5.2 live verdict table.
- **approve→generate trigger + reconcile change-detection** — wake-proofs OWED with the loop-flip / cadence-flip units (registered R-3/R-4); not yet built, so they stay DORMANT (not claimed wakeable-without-proof).

## Retro-diff vs the July 2026-07-11 audit (audit-method blind spot)

- The July "wiring truth" enumeration classified `drain-first-fetch` as **orphaned** — it traced code callers only and **missed the second cron job in `source-monitoring.yml`**. Correction (already in R-1): the census's conduction tracing MUST include **workflow files** (`.github/workflows/*.yml`), not just code callers — a cron job is a live invoker. This census includes all 5 crons by tracing the YAML.
- Otherwise the July registers align: drain retired (R-1), pending_first_fetch retained-for-flip (R-2), cadence-flip unit named (R-3), monitoring_queue dormant (R-4).

## Deferred-registered (T9 preempts — a focused census follow-on)

1. **Line-weight table** (lines-by-zone; src split shipped/test/types; verdict distribution in LINES; optional c8 coverage) — the standing weight metric.
2. **ARCHITECTURE.md** one-pager (stranger-legibility: the 5 entry points, zones, where the verdict table lives).
3. **Sediment policy** (completed one-shots → `scripts/archive/`; census-reds-a-one-shot-in-the-live-tree).
4. **CI census check** (`dormant-means-proven-wakeable` enforced: every dormant mechanism registered + every deliberate-off cites a green wake-proof).

These are documentation/enforcement scaffolding, not correctness — registered here, owned by the next census pass.
