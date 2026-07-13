# Conduction census (T8) — re-verified 2026-07-13 vs post-rebuild master `240b690`

**Recovered from the 07-12 T8 honest core (`f8698c0`) and re-verified against the machine that exists on
master today.** The snapshot-first rebuild (#295–#298) landed between 07-12 and now and changed the
grounding + acquisition conduction; every verdict below is re-checked, and the drift is flagged in
**§ Collisions vs 07-12** (bottom). Nothing here fires the machine — it reads code, workflow YAML, and
green wake-proofs only. **$0.**

**Conduction test** (operator standard): a path counts as WIRED only if traced end-to-end to a live invoker
AND its gate conditions permit execution in the current system state. Three verdicts: **WORKING** (proven) ·
**DORMANT-PROVEN-WAKEABLE** (a green wake-proof exists) · **DEAD-OR-UNVERIFIED** (delete / fix / explicit
retained-for-flip). The hold is NOT an excuse category. Surface: ~82 API routes · 5 cron workflows · 1 durable workflow.

**TIMEBOX (operator ruling):** this is the honest core — the verdict table + wake-proofs, re-verified. The
line-weight table, ARCHITECTURE.md one-pager, sediment policy, and the CI census check stay
**DEFERRED-registered** (bottom); none was trivially cheap during this pass, so none was taken.

## Crons (the "does it actually run" surface — conduction-traced through the workflow YAML)

| cron workflow | target | invoker live? | gate state now | VERDICT |
|---|---|---|---|---|
| `uptime-probes` (`*/30` surfaces + `0 9` spend) | `/api/health/surfaces` + `/spend` | ✅ GH cron ACTIVE | none (health/observability) | **WORKING** |
| `data-audit-lane` (`0 6` daily) | `scripts/verify/run-data-audit-lane.mjs` | ✅ GH cron ACTIVE | none (runs the audit; reflects into DATA_AUDIT_BLOCK / Layer C) | **WORKING** |
| `trust-recompute` (`0 3 1` monthly) | `/api/admin/recompute-trust` | ✅ GH cron ACTIVE | compute-only (no fetch, no model) | **WORKING** |
| `source-monitoring` (hourly) | `/api/worker/check-sources` | ⛔ **schedule DISABLED** (commented out) — `workflow_dispatch` only | ACQUISITION FREEZE (#295) **above** the cadence gate; if hand-dispatched, still `scrapeWindowOpen(cadence=off)` → no-op | **FROZEN → DORMANT-PROVEN-WAKEABLE** — wake needs (1) re-enable the schedule AND (2) set cadence; wake-proof `scrape-schedule.test.mjs` covers the cadence axis (4/4 GREEN on master) |
| `spot-check-monthly` (monthly) | `/api/admin/spot-check/recurring` | ⛔ **schedule DISABLED** (commented out) — `workflow_dispatch` only | ACQUISITION FREEZE (#295) — spends Haiku + Browserless; frozen above the scrape-hold gate | **FROZEN → DORMANT-PROVEN-WAKEABLE** — same two-step wake (schedule + hold); cadence/hold axis covered by the wake-proof |
| ~~`drain-first-fetch` job~~ | ~~`/api/worker/drain-first-fetch`~~ | — | — | **DEAD → DELETED** (R-1): route + cron job removed |

**Cron count reality:** 3 auto-firing (uptime / data-audit / trust — all $0, none acquire), 2 **frozen**
(source-monitoring, spot-check — dispatch-only, acquisition-frozen since #295). The 07-12 census listed the
two acquisition crons as live-invoker/DORMANT-via-gate; post-rebuild their **schedule itself is disabled**, a
deeper hold (see Collisions).

## Workflow + intake mechanisms

| mechanism | invoker | gate state (post-rebuild) | VERDICT |
|---|---|---|---|
| `generateBriefWorkflow` — preflight → generate → section | `start()` from `/api/agent/run` + staged approve | preflight (daily cap / pause / data-audit-block) **and** the frozen $75 monthly ceiling (exceeded) halts generate spend | **WORKING to section; generate spend HALTED by the frozen ceiling** |
| `generateBriefWorkflow` — **ground step** | (same) | **routes through the single `verify-item` entry (RD-24 / F21)**: snapshot → freshness → $0 cheap-verify → **acquire LOCKED** (`GROUNDING_ACQUIRE_ENABLED` OFF). Fresh brief → `needs_acquire` → `AcquireLockError` → `grounding_frozen_held` (brief HELD, never erased) | **DORMANT-PROVEN-WAKEABLE** — master-switched OFF; wake-proofs `verify-item.test.mjs` + `acquire-lock.test.mjs` |
| `verify-item` (the ONE grounding entry) | `groundStep`, `regen-quarantined` (act:false) | snapshot-first; paid acquire behind the master switch (OFF) | **WORKING (as decision, $0); paid branch DORMANT-locked** — F21 forbids any other grounding entry |
| mint chokepoint (`mintIntelligenceItem`) | `applyStagedUpdate` (scan-approve + `runIntakeCycle`) | congruence + dedup + F13 | **WORKING** |
| `runIntakeCycle` (machine intake) | `/api/admin/run-intake` (route live; no UI control) | plan default; apply = F16 signed caller | **DORMANT-PROVEN-WAKEABLE** — plan-mode proven (`plan-intake.test.mjs`) |
| approve→generate trigger | staged-updates approve | behind `isGloballyPaused` (loop flag) | **DORMANT** — wakes when the loop flag is off (proof owed with the loop-flip unit) |
| `reconcile` worker | `monitoring_queue.change_detected=true` | `content-change.mjs` hardcodes `change_detected:false` | **DORMANT (dead-because-input)** — R-4; folded into the cadence-flip unit's scope |
| pending_first_fetch queue | mig-065 trigger (writer); reader retired | retained-for-flip | **DORMANT** — R-2; new reader = cadence-flip unit (R-3) |

## Routes (~82) — class summary

- **Customer surfaces** (regulations/market/research/operations/community + detail pages): **WORKING** (SSR, gate on `provenance_status='verified'`).
- **Admin-fired actions** (scan, staged-updates, sources/promote, canonical-sources/*, run-intake, recompute-*): **WORKING** (operator-invoked, admin-gated).
- **Worker routes**: check-sources (**FROZEN**, schedule disabled) · spot-check (**FROZEN**) · reconcile (DORMANT-dead-input) · drain-first-fetch (DELETED).
- **Health** (`/api/health/*`): **WORKING** (uptime-probed).
- No route is DEAD-orphaned after the drain-first-fetch deletion; `/api/agent/run` grounding is DORMANT-locked (acquire switch OFF), not dead.

## Wake-proofs (the flip set)

- **Cadence engine** (`scrapeWindowOpen`) — the deliberate-off gate for the two acquisition crons + the cadence-flip intake. **WAKE-PROOF GREEN:** `src/lib/sources/scrape-schedule.test.mjs` (4/4, re-run on master `240b690`) — cadence OFF → closed; cadence set + on-cadence day → **OPENS**; paused-until-start honored. No live fetch/spend.
- **Grounding acquire master switch** (NEW, post-rebuild) — `GROUNDING_ACQUIRE_ENABLED` default OFF. **WAKE-PROOF GREEN:** `acquire-lock.test.mjs` (OFF→`AcquireLockError`; affirmative token→passes) + `verify-item.test.mjs` (no snapshot + OFF → justification logged THEN throws; changed source → stale-flag, no fetch, no flip; snapshot + cheap-pass → verified_cheap $0). The gate that holds live grounding while ceiling/lock are engaged.
- **runIntakeCycle plan-mode** — `plan-intake.test.mjs`.
- **approve→generate + reconcile change-detection** — wake-proofs OWED with the loop-flip / cadence-flip units (R-3/R-4); DORMANT, not claimed wakeable-without-proof.

## Collisions vs the 07-12 census (post-rebuild drift — flagged, not force-carried)

The 07-12 core predates #295–#298. Three assertions were stale and are corrected above; none was pushed through:

1. **`source-monitoring` cron** — 07-12: "✅ GH cron live, DORMANT via `scrapeWindowOpen(cadence=off)`." **Now:** the hourly **schedule is commented out** (ACQUISITION FREEZE, #295); the cron does not auto-fire at all — only `workflow_dispatch`. The hold is *above* the cadence gate. Corrected to FROZEN → DORMANT-PROVEN-WAKEABLE with a **two-step** wake (re-enable schedule + set cadence).
2. **`spot-check-monthly` cron** — 07-12: "✅ GH cron, DORMANT via scrape off-gate." **Now:** monthly **schedule commented out** (#295). Same correction.
3. **`generateBriefWorkflow` = WORKING** — 07-12 treated the whole workflow as WORKING behind preflight. **Now:** the **ground step routes through `verify-item` and is master-switched behind the acquire lock (OFF)** → `grounding_frozen_held`; generate spend is halted by the frozen $75 ceiling. Split into "WORKING to section / grounding DORMANT-locked." The single-entry consolidation (F21; ~25 standalone grounding runners deleted in #296) is new machine the 07-12 census could not describe.

Net: the machine on master today acquires **nothing** unattended — 2 acquisition crons frozen at the schedule, grounding master-switched OFF, ceiling frozen/exceeded — and every deliberate-off gate cites a green wake-proof.

## Deferred-registered (still owned by the next census pass — none taken this pass)

1. **Line-weight table** (lines-by-zone; verdict distribution in LINES).
2. **ARCHITECTURE.md** one-pager (the entry points, zones, where the verdict table lives).
3. **Sediment policy** (completed one-shots → `scripts/archive/`).
4. **CI census check** (`dormant-means-proven-wakeable` enforced). *Mechanism/CI class — if built, it lands under the operator-hold convention, not this docs pass.*
