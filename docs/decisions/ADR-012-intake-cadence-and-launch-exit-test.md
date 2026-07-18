---
id: ADR-012
title: Intake cadence model (manual-triggered, auto-cadence dormant) + the launch-complete exit test
status: superseded
date: 2026-07-11
scope: fsi-app intake pipeline (discovery→triage→mint→ground→validate), F16 scrape-hold semantics, program launch definition
supersedes: the emergency-framing of the scrape hold ("hold is a temporary safety engagement lifted when cadence is set"); the per-dispatch ad-hoc launch-readiness framing
superseded_by: ADR-015
related: ADR-011, ADR-015, RD-11 (F16 fetch-hold gate), remediation-discipline §4 cat 10, Disposition Engine dispatch (Units 0-5), Wave-β Stage B
---

> **SUPERSEDED 2026-07-18 by [ADR-015](./ADR-015-restore-source-monitoring-supersede-adr-012.md).**
> Section 1's "manual intake is the operating design, not a temporary safety posture" is retired: the
> dormant-systems audit established it described a spend-crisis freeze, not design intent, and the
> founding source-monitoring design is restored as the operating model. The config-only restoration
> claim was falsified (freeze commit `11c008c2` commented out the workflow schedules; restoration is
> code + config + env). The two owed invocation surfaces (admin control + script path for
> `/api/admin/run-intake`) are recorded as debts the crawl rebuild discharges. The RD-11/F16
> two-caller mechanism, RD-20 staged-transit, and the launch-exit-test clauses in this ADR carry
> forward (mechanism, not the retired framing). This ADR is retained verbatim below as the historical
> record.

# ADR-012 — Intake cadence + launch-complete definition

## Decision (operator ruling, Jason, 2026-07-11, transmitted-as-written)

### 1. Intake is MANUAL-TRIGGERED by design (not an emergency hold)

The scrape/intake operating model is **operator-fired manual runs**, with saved/auto cadence as a
**later config switch**. This is the operating design, not a temporary safety posture.

- A first-class **"run intake now"** operator control is built: an **admin surface** control + a
  **script path**, either of which executes **one full `discovery → triage → mint → ground →
  validate` cycle through the existing chokepoints and STOPS**. No loop, no schedule.
- The **saved-cadence / auto** mechanism stays **built and dormant**. Flipping it on later is
  **config, not code**.
- **F16 / hold semantics update (amends RD-11):** the hold gates **AUTONOMOUS / scheduled**
  fetching. A **manual operator-fired run is a signed exception** through the **same manifest-bound
  mechanism** as Unit-3 remediation fetches — **one mechanism, two authorized callers
  (manual-intake-run, unit3-remediation), no third door.** A raw fetch outside that mechanism
  remains forbidden (F16 unchanged in its bypass-prohibition; extended in its allow-list shape).

Implementation home: the Disposition Engine dispatch **or a small rider** — the manual-intake
control + the F16 two-caller allow-list extension (with F16's test extended to prove the allow-list
is manifest-bound, not a hole).

#### PRIOR ART — retrieval before generation (2026-07-11, operator-flagged: "we already had a ability to schedule the intake of data manually")

The cadence + manual-trigger mechanism **substantially EXISTS**; this ruling is a **wire + reframe**,
NOT a from-scratch build. What is already on master:

- **The dormant auto-cadence** — `src/lib/sources/scrape-schedule.ts`: a pure global schedule
  (`cadence: off|weekly|monthly` + `start_date` anchor) on the `system_state` singleton, with
  `scrapeWindowOpen()` (the worker's per-tick "run now?") and `nextScrapeDate()` (admin display).
  Per-source cadence is retired; this global schedule is the single WHEN source of truth. **This IS
  the "saved-cadence/auto stays built and dormant" mechanism** — it is built, keep it.
- **The admin control to SET cadence** — `POST /api/admin/sources/pause-global` sets
  `{cadence, start_date}` and/or `{paused}` (an independent emergency stop that preserves the saved
  plan); `GET` returns schedule + computed next-scrape. Admin-gated.
- **The manual DISCOVERY trigger** — `POST /api/admin/scan` (operator-fired web_search discovery →
  dedup → portal-vs-reg classification → stages to `staged_updates`, never auto-published;
  admin-gated, 4h cooldown). **It currently HONORS the hold** (`pausedResponse` → "Lift the hold to
  run a scan") — that is exactly the semantics this ruling changes.
- **Manual per-source fetch** — `POST /api/admin/sources/[id]/fetch-now`; extra discovery —
  `POST /api/admin/sources/discover`.
- **The scheduled worker** — `POST /api/worker/check-sources` gates on `scrapeWindowOpen()` +
  `isGloballyPaused()` (the autonomous/scheduled path that MUST keep obeying the hold).
- **Mint → ground → validate** — `drain-first-fetch` (mint chokepoint) → `agent/run`
  (generate→section→ground→grow). All built.

Two gates exist and today both block a manual run: `pause.ts::isGloballyPaused()` (cadence 'off' OR
emergency stop) and `fetch-hold.mjs` F16 (`SCRAPE_HOLD` env at `browserlessFetch`). The reframe:
the hold gates the SCHEDULED worker; the manual operator-fired path passes as a signed,
manifest-bound exception (second authorized caller), NOT by lifting the hold globally.

**So the actual work is small:** (1) a single "run ONE full discovery→triage→mint→ground→validate
cycle and STOP" orchestration over the existing routes; (2) let the manual caller through the hold
via the signed exception while the worker still obeys it; (3) surface the "Run intake now" control on
the admin surface (the schedule control UI already exists in `SourceAdminControls`/`AdminDashboard`).
Do NOT re-implement the cadence model, the schedule store, the admin schedule control, discovery, or
the mint chokepoint — they exist.

#### RIDER CLARIFICATION (operator, 2026-07-11) — the human-approval step is REMOVED, not bypassed

The `staged_updates` **human-approval gate is removed from the intake path entirely** — NOT bypassed
"just for the dry-proof." The **machine gates ARE the approval**: source↔claim-type congruence, the
high-precision subject-existence dedup, the single mint chokepoint (`mintIntelligenceItem`), the
per-item-type authority floors, and the grounding judge. There is no second, human, approval.

- `staged_updates` becomes **transit-only** — a pass-through with a **max-age invariant like
  `provisional`** (an item may not sit in staged transit past the bound). It is no longer a resting
  review queue.
- **Admin gets visibility, not a gate**: what was staged, what minted, and what was rejected and why
  — observability over the machine decisions, with no human approval step in the path.
- **Governing doctrine entry**: this is `no-human-finish-of-intake` (Unit-0 register seed item). The
  manual-intake wiring cites THAT entry as its authority; it is the same doctrine as
  no-quarantine-as-resting-state applied to the intake queue.
- **The materialization-failure path (P1 #5 class) STAYS and is unchanged**: a failed materialization
  routes to the **flag resolver** (Disposition Engine Unit 2 / `integrity_flags`), NOT to a human
  queue. Machine-gate REJECT and materialization FAILURE are both machine-routed, never human-parked.

This supersedes the standing `fsi-app/.claude/CLAUDE.md` lines "Staged updates require human approval"
and "DO NOT ... `/api/admin/scan` stages new items in `staged_updates` for admin review" **for the
intake path** — those doctrine lines are updated WHEN the wiring lands (disposition dispatch), not
before. Human approval is retired from intake; machine gates carry it.

### 2. LAUNCH EXIT TEST — the build-complete definition

The program is **build-complete** (launch-ready) only when ALL hold simultaneously on master:

1. **All queues 0** (provisional 0, Issues red 0, no transit backlog).
2. **Quarantine 0.**
3. **Flags = valid-deferrals-only** (zero undispositioned past-bound; every open flag is a valid
   time-bounded deferral or a routed mechanism).
4. **Verified corpus fully dispositioned** — every item is **verified OR honestly deleted**
   (via the eligibility gate + log); **nothing in transit**.
5. **Wave-α + Disposition + Wave-β exit tests all green on master.**
6. **Doctrine register complete with zero unenforced entries** (meta-gate: unenforced doctrine = FAIL).
7. **Overflow/hydration guard green including mobile tiers.**
8. **Dead code zero.**
9. **Manual intake run PROVEN end-to-end on a small source set** — the **intake dry-proof**:
   discovery through a verified item with **zero human touch mid-pipeline**.

At that point **launch-readiness = Jason fires intake runs at will.**

### 3. Sequence (unchanged)

enforcement lands → cleanup → Disposition Engine (**Unit 0 register first**) → Wave-β →
residue closeout (g19/g27, U-01..U-10) → **intake dry-proof** → launch-ready state declared with
the exit-test evidence.

## Why an ADR

Two durable, cross-dispatch decisions: (a) the scrape hold is **reframed** from emergency to a
permanent-until-config manual-trigger model — this rewrites how RD-11 / F16 is described and adds a
second authorized caller, so it must not be rediscovered as "why is fetching held"; (b) the
launch-complete definition is now a **fixed nine-clause exit test**, not a per-dispatch judgment
call — every remaining dispatch closes against it. Both bind future work; both become landmines if
left as session memory.

## Consequences

- The Disposition Engine dispatch gains a **manual-intake-control rider** (admin surface + script +
  F16 allow-list extension + extended F16 test). Unit 0's doctrine register records the manual-intake
  doctrine and the two-caller F16 semantics as an enforced entry.
- The **intake dry-proof** becomes a named terminal gate before the launch-ready declaration.
- No change to the standing constraints: general autonomous/scheduled fetching stays gated; all spend
  ticketed; deletes via eligibility gate + log; the manifest-bound mechanism is the single fetch door.

## Related

- [ADR-011-ddl-authority-delegation](./ADR-011-ddl-authority-delegation.md) — the DDL-apply delegation posture this decision builds on
- [ADR-013-phase3-closure-and-scope-doctrine-tightening](./ADR-013-phase3-closure-and-scope-doctrine-tightening.md) — closes the Phase-3 restitution posture referenced here and tightens the report-scope doctrine
- [worktree-isolation](../doctrine/worktree-isolation.md) — Disposition Engine Unit 0 (doctrine register) that this decision's manual-intake doctrine feeds
