# Phase 4b SQL Review, Final

**Sprint:** Sprint 1
**Phase:** Phase 4b, operator queue tables + rejected-token routing
**PR:** #120 (https://github.com/Dwarves77/dotfiles/pull/120)
**Date:** 2026-05-18
**Reviewer:** Operator (pre-merge gate)
**Applied to prod DB:** Migration 082 applied 2026-05-17 (1 applied, 0 failed, cache reloaded)
**Verdict:** Clean to merge. Three operational issues captured in followups, none blocking.

---

## 1. Architecture Verification

| Check | Migration 082 reference | Status |
|---|---|---|
| Two operator queue tables created | `ingest_rejections` (lines 63-85), `pending_jurisdiction_review` (lines 111-133) | Pass |
| DEFERRABLE FK on PJR | Lines 138-143: `DEFERRABLE INITIALLY DEFERRED` with `ON DELETE CASCADE`. Required so BEFORE INSERT trigger can write referencing `NEW.id` before parent row is materialized. FK check fires at COMMIT | Pass |
| Partial unique dedup on PJR | Lines 149-152: `(intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL`. Prevents duplicate unresolved flags. Resolved rows do not occupy the slot; if the same token re-fires post-resolution, a new flag is legitimately created | Pass |
| RLS pattern matches Q2 decision | Lines 174-223: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)`. No Postgres role. SELECT + UPDATE only; no INSERT policy (trigger SECURITY DEFINER + service_role write); no DELETE policy (audit integrity) | Pass |
| SECURITY DEFINER properly bounded | Line 239-240: `SECURITY DEFINER` with `SET search_path = public, pg_temp`. Search-path injection blocked. Privilege escalation bounded to writing the two queue tables | Pass |
| Trigger consumes TABLE return correctly | Lines 248-251, 272-275: `SELECT * INTO norm_jur FROM _normalize_jurisdictions(...)` then access via `norm_jur.canonical` / `norm_jur.rejected`. No re-implementation of classification logic | Pass |
| Single source of truth for classification | Lines 254, 278, 312, 325: all four routing decisions call `_classify_jurisdiction_token(...)`. No drift hazard between trigger and helper | Pass |
| OBS-4 source_column tracking implemented | Lines 116, 124-126: `source_column text NOT NULL DEFAULT 'jurisdictions'` with CHECK against `('jurisdictions', 'jurisdiction_iso')`. Comment line 165 references followups.md OBS-4 | Pass |
| Populate idempotency | Lines 307-331: two `INSERT...SELECT` with `ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING`. Migration is re-runnable | Pass |
| Reversibility documented | Header lines 38-44: drop tables CASCADE, recreate trigger function with 080's 4a-only body. Canonical-entity columns from 079 and CASE extension from 080 unaffected | Pass |

---

## 2. Dry-Run Trace Verification

Agent reported, in a rollback transaction: input `['US','BROOKLYN','CARSON_RIVER_WATERSHED','ASIA']` produced canonical `['US','US-NYC']`; ASIA routed to `pending_jurisdiction_review` (continent); CARSON_RIVER_WATERSHED routed to `ingest_rejections` (non_geographic).

Manual trace through 080's CASE plus 082's trigger:

1. `US` matches CASE line 154, returns `US` to canonical.
2. `BROOKLYN` matches CASE line 327, returns `US-NYC` to canonical.
3. `CARSON_RIVER_WATERSHED` no CASE match, no 2-letter shape match, no ISO-3166-2 shape match, falls to rejected. `_classify_jurisdiction_token` matches the `WATERSHED|RIVER|BASIN|...` regex, returns `non_geographic`. Trigger routes to `ingest_rejections`. Confirmed.
4. `ASIA` no CASE match, no shape match, falls to rejected. `_classify_jurisdiction_token` matches the continent set, returns `continent`. Trigger routes to `pending_jurisdiction_review`. Confirmed.

End-to-end trace correct.

---

## 3. Populate Count Reconciliation

Pre-flight reported 107 token-rows across 72 distinct items, decomposed as 48 continent + 38 region_bucket + 21 undefined_group. Arithmetic check: 48 + 38 + 21 = 107. Confirmed.

The 72-item count is lower than the ~83 estimate from Phase 3 operator decisions (decisions 2/3/4). The delta is unexplained but reasonable: the estimate was loose; some items may have been touched between estimate and populate. Migration 082 header comment line 162 captures the reconciliation note explicitly.

---

## 4. Issues Captured (Non-Blocking)

### ISSUE-1, medium: trigger pollution on UPDATEs

Lines 263-268 and 285-289: the trigger writes to `ingest_rejections` without `ON CONFLICT` for every rejected token on every INSERT or UPDATE. This is correct for INSERT events. On UPDATE, if the intelligence_item still carries pre-existing rejected tokens (which Phase 5 has not yet cleaned), the trigger creates new `ingest_rejections` rows even though no actual ingest occurred.

Phase 5 backfill is the exact workflow that triggers this pollution.

Mitigation captured as OBS-5 in `docs/sprint-1/followups.md`. Recommended Phase 5 design path: disable the trigger during backfill, route rejected tokens manually in the backfill script. Long-term Sprint 2 candidate: a migration 083 adding a `TG_OP` guard to the trigger function.

### ISSUE-2, low: triage_action enum lacks reclassification target

`ingest_rejections.triage_action IN ('discarded', 'reclassified', 'escalated')` has no field to record the canonical replacement when an operator reclassifies. Compare PJR which has `resolution_value`. The asymmetry is defensible (ingest_rejections is an audit log, not a resolution queue), but Phase 7 triage UI needs a Phase 7 design decision: add `ingest_rejections.reclassified_to` column, or write the operator's reclassification decision to a separate audit table.

Captured as a Phase 7 design item, not a 082 fix.

### ISSUE-3, low: source attribution on UPDATEs may drift

Lines 267 and 287: trigger captures `NEW.source_url` and `NEW.source_id` from the intelligence_item being updated. For an UPDATE, this is the item's current source, not necessarily the source where the bad token originated. If an item's source has been updated since the bad token was first ingested, audit attribution drifts.

Not a defect (audit log captures state at trigger time), but worth a one-line comment on the column explaining the semantic. Doc-only follow-up.

---

## 5. Followups Doc State

After this review, `docs/sprint-1/followups.md` carries five operational items:

- **OBS-1** cleared post-082 apply (was: Phase 5 sequencing constraint during 4a-only window)
- **OBS-2** open (low priority, ISO pass-through validation gap, pre-existing from 072)
- **OBS-3** open (lowest priority, ICAO literal-string fragility)
- **OBS-4** implemented (source_column tracking landed on PJR table via 082)
- **OBS-5** new (trigger pollution on UPDATEs, captured from this review; Phase 5 design dependency)

OBS-6 is reserved as a placeholder for future-phase entries.

---

## 6. Merge Recommendation

Authorize merge of PR #120. The three doc commits updating followups.md, narrowing perf-1-design.md, and adding this review file should land on the same branch as additional commits before the merge.

Phase 5 design doc must address OBS-5 before Phase 5 backfill work starts. Recommend Option 1 from OBS-5 (disable trigger during backfill, route manually).

PERF-1 implementation can dispatch in parallel after PR #120 merges, per the revised browser-cache-only design.

---

## 7. Sprint 1 Cluster Priority Status Post-Merge

| Item | RC | Status post-PR-#120 |
|---|---|---|
| 1 | RC-9 (canonical entity dedup gate) | 079 shipped (schema). Phase 5 applies it (dedup transactions). |
| 2 | RC-1 (admin signal consolidation, Option C) | 081 shipped (documentation half). Phase 7 ships the helper split (`requirePlatformAdmin()` / `requireOrgAdmin()`). |
| 4 | RC-7 (jurisdiction vocabulary close) | 080 shipped (vocabulary + classifier). 082 shipped (routing + queues). Phase 7 ships the triage UI. |
| 5 | RC-5 (workspace anchoring on index queries) | Not yet shipped. Phase 8. |

Sprint 1 is approximately two-thirds shipped at the schema layer. Phase 5 (data migration) and Phase 7 (UI / role-gate) remain.
