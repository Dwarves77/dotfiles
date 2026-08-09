---
id: ADR-017
title: The #43 provenance binding gates the escalation into 'verified', bound to the validation derivation by trigger depth, not the flip off 'unverified' bound to a session GUC
status: accepted
date: 2026-08-09
scope: fsi-app provenance integrity — guard_provenance_flip / set_provenance_status triggers on intelligence_items, migration 250 superseding migration 118's enforcement mechanism, the #43 decision-log invariant, the reconciler credential's role
supersedes: migration 118's enforcement MECHANISM (the stamp_prov_origin session-GUC origin stamp + the OLD='unverified' guard scope); the tech-debt entry "reconciler credential broken" as a corpus-reconciliation blocker
related: migration 118 (the reconciler role + grants + RLS, RETAINED), migration 250 (this decision's implementation), migration 226 (gate_a_health read-side backstop), audit-gate.ts (the cross-item write-path enforcer), docs/audits/full-code-reading-audit-2026-08-09.md (finding P0#6), the class-4 lesson in scripts/verify/prov-guard-adversarial-audit.mjs, rule 14 (finding-status labeling)
---

# ADR-017 — Provenance 'verified' is bound to the derivation, by trigger depth

## Context

Decision-log invariant #43 requires that the unrestricted service-role key cannot cause a
pre-existing item to be marked provenance-clean. Migration 118 implemented that as: a `BEFORE UPDATE`
guard on `intelligence_items` that rejected any flip OFF `provenance_status='unverified'` unless
`current_user='reconciler'` or a companion trigger (`stamp_prov_origin`) had recorded, in the
session GUC `app.prov_flip_origin`, that the write originated from an INSERT.

A full-code-reading audit (2026-08-09) flagged the GUC as transaction-local-but-never-cleared
[HYPOTHESIS at flag time]. Live introspection during the fix [CONFIRMED] a deeper set of holes:

1. **The origin stamp is forgeable.** `app.prov_flip_origin` is an ordinary session GUC. Any role
   with a SQL channel can run `SELECT set_config('app.prov_flip_origin','INSERT',true)` and satisfy
   the carve-out directly. The binding to `reconciler` was decorative — service-role could forge it.
2. **The depth test was inert.** `pg_trigger_depth() >= 1` evaluated inside the guard is always
   true (the guard is itself trigger #1), so it excluded nothing.
3. **ON CONFLICT mis-stamped.** `INSERT ... ON CONFLICT DO UPDATE` fires BEFORE INSERT row triggers
   even for rows that take the update path, stamping an update as INSERT-origin.
4. **The dominant escalation was never guarded.** The guard fired only on `OLD='unverified'`. The
   real corpus lifecycle parks failed births at `'quarantined'`, so the `quarantined -> verified`
   transition — the one 180 live rows were a single UPDATE away from — was outside the guard
   entirely. Any role could bless a quarantined row.

Separately, migration 118's restrictive-direction scope had a legitimate-work cost: it blocked the
harmless `unverified -> quarantined` flip and touch-and-derive re-grounding for non-reconciler roles,
which is the "reconciler credential broken" tech-debt wedge (claim-inserts on the 6 unverified
orphans ERRORED).

## Decision

Bind the ESCALATION, not the departure. `guard_provenance_flip` now gates every transition INTO
`provenance_status='verified'` and allows it only when:

- `current_user = 'reconciler'` — the bound credential from migration 118, unchanged; or
- `pg_trigger_depth() >= 2` inside the guard — the UPDATE was issued from inside another trigger.

The depth condition is sound because of a live-verified schema fact: `set_provenance_status` (the
validation derivation that calls `validate_item_provenance` and stamps the recommended status) is the
ONLY trigger function in the schema that writes `intelligence_items.provenance_status`. A top-level
statement lands the guard at depth 1; depth >= 2 is reachable only from inside an owner-created
trigger. Trigger depth is engine state — it cannot be `set_config`'d, spoofed, or reached by any SQL
a non-owner can issue. So "was this write produced by the validation derivation?" is answered by
construction, not by a marker the writer controls.

Non-escalating transitions (`-> quarantined`, `-> pending_human_verify`, any downgrade off
`verified`) are deliberately left open: they are restrictive, the derivation needs them (birth
quarantine, re-ground resets), and gating them is what wedged legitimate reconciliation.

The `reconciler` role, its grants, and its RLS policies from migration 118 are RETAINED unchanged as
the sanctioned direct-write escape hatch. `stamp_prov_origin` and its trigger are DROPPED.

## Scope change, stated plainly

Migration 118's letter guarded "a flip OFF 'unverified' (any target)." This guards "a transition
INTO 'verified' (any origin)." That is a deliberate change of the guarded set, made because the old
set was simultaneously too narrow (missed `quarantined -> verified`, the dominant path) and too broad
(blocked harmless restrictive flips). The new set matches the invariant the rest of the platform
already enforces: customer reads gate on `='verified'`, audit-gate.ts treats 'verified' as
"validation passed," and gate_a_health alarms on any verified row that would fail revalidation.
'verified' is a machine-stamped claim; this binding makes the database agree.

## Consequences

- **Positive.** The named adversary (service-role key) can no longer reach 'verified' by any SQL
  path — forged GUC, direct escalation, or ON CONFLICT — proven live under rollback. The
  reconciler-credential tech-debt blocker is dissolved: corpus reconciliation runs through
  touch-and-derive at depth >= 2. The binding is re-attacked every data-audit run.
- **Residual, unchanged.** Not owner-proof: `postgres` owns the table and can disable the trigger
  (bound by operator-side credential scoping, per migration 118's residual). Forged upstream inputs
  (claims/spans/gate-A state) can still steer validation itself; bound by the append-only guards and
  the mint chokepoint, not here. Downgrade vandalism (`verified -> X` by any role) remains open by
  design.
- **Enforcement mechanism, not just artifact.** Presence checks (migration 118 was "verified" by a
  build script asserting the triggers existed and were enabled) do not prove a security invariant.
  This decision ships with an adversarial proof that attacks the guard and requires the attack to
  fail, wired hard into the data-audit lane. That pattern — attack, don't assert-presence — is the
  standing rule for security-critical invariants going forward.
