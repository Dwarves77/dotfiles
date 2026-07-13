---
id: ADR-013
title: Phase-3 restitution CLOSED (not run) + population-count reports must state archival predicate
status: accepted
date: 2026-07-13
scope: snapshot-first grounding rebuild (PR-1 #295, PR-2 #296), quarantine restitution, report-scope doctrine
supersedes: the "Phase 3: gated, awaiting a separate operator go" posture recorded during the snapshot-first rebuild
related: ADR-012, RD-24..RD-29 (snapshot-first invariants), remediation-discipline §2.1/§2.2 (research-or-erase, deferred-vs-undispositioned), doctrine report-states-quarantine-scope
---

# ADR-013 — Phase-3 closure + archival-predicate labeling

## Context (operator ruling, Jason, 2026-07-13)

The snapshot-first grounding rebuild shipped in two PRs: **#295** (safety core — crons frozen, spend
gauge, acquire-lock default OFF, snapshot store, I1 write-side) and **#296** (retire the old grounding
path, snapshot-first routing through the single `verify-item` entry, I1 caller wiring, F21 + RD-24..RD-29).
Both moved **$0**. `GROUNDING_ACQUIRE_ENABLED` stays OFF; `MONTHLY_SPEND_CEILING_USD` ($75, code-only) is
untouched.

**Phase 3** was designed as a $0 cheap-verify batch over the snapshot-covered quarantined population
(the "~180 of 197", priority the "76 June-undispositioned"). A post-merge census + a read-only SQL
forensic (drift-reconciliation dispatch) established that the population Phase 3 was built for **no longer
exists**:

- Live quarantine backlog is **37** (`is_archived=false AND provenance_status='quarantined'`), not 197.
- The "197" was a **status-only** count: `197 = 37 live + 160 already-archived rows still carrying
  quarantined status` (reproduces to the unit). Predominantly a **scoping artifact**, plus a legitimate,
  reasoned, reversible **disposition wave** (2026-07-11..13) that drained the backlog at $0 through the
  guarded `reclassifyToSource` / dedup paths (48 archived + 4 recovered during the 2026-07-13 crisis
  window, all June-origin, all $0 DB operations — NOT paid grounding).
- Disposition split of the live 37: **June-undispositioned 0** (the real historical alarm, now genuinely
  zero) / RD-6-deferred 31 (owner Jason, `deferred_until=2026-10-31`) / within-dwell 6. Disposition
  invariant holds.
- **No hard-deletes**; corpus intact at 655 rows; no denylist / RD-1 violation.

## Decision

### 1. Phase 3 is CLOSED, not run

The restitution batch is retired. Its work was already accomplished by other means (the 2026-07-11..13
disposition waves, at $0, through the guarded paths). **A future session must NOT find "Phase 3: gated,
awaiting go" and run it** — there is nothing to restitute:

- June-undispositioned = 0.
- The 31 deferred are owner-Jason **resting until 2026-10-31** and stay **untouched**.
- The 6 within-dwell are inside their window.

**The cheap-verify entry point built in #296 becomes the standing mechanism** (not a one-shot batch): any
item **exiting deferral on 2026-10-31** or **crossing the dwell bound** routes through the single
`verify-item` entry — snapshot lookup → freshness probe → **$0 span-match** by default, paid acquire
master-switched behind `GROUNDING_ACQUIRE_ENABLED` (OFF). That is exactly what Phase 3 would have done,
now as a continuous default instead of a gated campaign.

### 2. Record correction

The Phase-0 **"197"** and its **76 / 106 / 7** sub-buckets are annotated **mixed-scope / imprecise**: the
197 was status-only (swept in 160 archived rows) and the 76/106/7 sub-buckets (= 189) partition neither
197 nor 37 — an earlier live snapshot taken before the disposition waves. The **honest historical alarm
number was the June-undispositioned backlog**, which was real and is now genuinely **zero**.

### 3. Doctrine tightening — archival predicate on every population count

The `report-states-quarantine-scope` doctrine already requires **global-vs-scoped** labeling. It is
extended one notch: **any quarantine or population count MUST also state its archival predicate**
(live-only = `is_archived=false` | status-only = `is_archived`-agnostic), alongside scope. This exact
ambiguity produced, in one week, both a **~5x understatement** (a scoped "~39" mistaken for global) and a
**~5x overstatement** (a status-only "197" mistaken for the live backlog of 37). The doctrine remains
**process-exempt** (it binds report prose; no CI parses prose), carried by the doctrine register + the
meta-gate. Census scripts SHOULD emit both counts at the query layer.

Landed in this micro-PR: `fsi-app/.discipline/governance/doctrine-register.mjs`
(`report-states-quarantine-scope` statement + reason), meta-gate re-validated green.

## Consequences

- The snapshot-first rebuild is **complete**; no restitution campaign remains open.
- The Oct-31 deferral exit and any dwell crossing are handled by the standing `verify-item` default, at
  $0, with the paid path locked.
- Future population/quarantine reports carry both scope and archival predicate, closing the ambiguity that
  caused two opposite mis-statements in one week.

## Related

- [ADR-012-intake-cadence-and-launch-exit-test](./ADR-012-intake-cadence-and-launch-exit-test.md) — the intake/launch decision whose Phase-3 posture this ADR closes
- [ADR-011-ddl-authority-delegation](./ADR-011-ddl-authority-delegation.md) — the DDL-apply authority under which the disposition-wave `$0` DB operations ran
- [reconciliation-remediation-closeout-2026-07-11](../ops/reconciliation-remediation-closeout-2026-07-11.md) — the remediation closeout documenting the 2026-07-11..13 disposition waves this ADR reconciles
