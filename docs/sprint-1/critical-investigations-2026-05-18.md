# Caro's Ledge Sprint 1 Critical Investigations Report, 2026-05-18

**Date:** 2026-05-18
**Source dispatch:** operator Triage and Investigation Authorization Packet, post system-audit at [docs/sprint-1/system-audit-2026-05-18.md](docs/sprint-1/system-audit-2026-05-18.md)
**Branch state:** `feat/sprint-1-phase-5-implementation` at `3d887c0` (post REC-OBS additions)
**Method:** two parallel background research agents (Critical #1 jurisdiction_iso scope, Critical #2 integrity_flags reconciliation)
**Skill load:** `sprint-followups-discipline` and `environmental-policy-and-innovation` invoked (per operator standing rules)
**Status:** REPORT ONLY. No remediation. Operator authorizes any new OBS, any migration work, and the Phase 6 / Phase 7 gate decision in a separate dispatch.

---

## Headline summary

Both investigations completed. **One finding came back as expected; the other came back significantly worse than expected.**

- **Critical #1 (jurisdiction_iso empty on parseable-token rows):** RESOLVED as a trigger semantic gap, NOT a Phase 5 backfill bug. The 10-row sample in the audit understated the scope: actual count is 451 rows with the pattern, of which 362 carry purely parseable canonical tokens. Zero regression: every affected row was already ISO-empty before Phase 5 ran. Phase 5 script faithfully mirrored the trigger semantic per its design contract. **PR #122 merge recommendation: PROCEED with caveat.**
- **Critical #2 (`integrity_flags` table absent):** ESCALATED to a 25-migration schema ledger drift. The operator's hypothesis ("Section A had a false negative; table exists") was incorrect. Section A's query was correct; the table is genuinely absent. Migrations 026 through 050 (plus 070 and 078) are all missing from `supabase_migrations.schema_migrations`. The `recurring_spot_check_log` table has no migration file anywhere in `supabase/migrations/` despite admin code references. **Recommendation: HALT both Phase 6 AND Phase 7 design.**

The two findings are unrelated by mechanism but compound by sequencing: Critical #1 affects Phase 6 ingest design (you need to decide the trigger remediation approach before designing Phase 6 brief generation that writes to the same columns), and Critical #2 affects Phase 7 chrome design (you need to decide the schema ledger reconciliation approach before designing Phase 7 around tables that may or may not be present).

---

## Critical #1: jurisdiction_iso scope and root cause

### Scope (actual vs audit-sampled)

The audit sampled 10 rows. The actual count of rows in the suspicious pattern is much larger.

| Row classification | Count |
|---|---|
| Total rows with populated `jurisdictions` AND empty `jurisdiction_iso` | **451** |
| Of those, purely parseable canonical tokens (ISO 3166-1 alpha-2 only) | 154 |
| Of those, purely subdivision tokens (ISO 3166-2, e.g. `['US-PA']`) | 123 |
| Of those, mixed alpha-2 + subdivision (e.g. `['CA','CA-ON']`) | 85 |
| Of those, other / non-ISO shape (continents, region buckets, unparseable) | 89 |

**Suspicious set: 362 rows** (154 + 123 + 85). These rows carry tokens that look like they SHOULD populate `jurisdiction_iso` per intuitive reading of migration 080.

### Snapshot comparison (zero regression confirmed)

| Outcome | Count |
|---|---|
| snapshot empty, live empty | **451** |
| snapshot non-empty, live empty (regression) | **0** |
| snapshot non-empty, live non-empty | 0 |
| no snapshot row | 0 |

**Phase 5 caused no regression.** Every currently affected row was already ISO-empty before Phase 5 ran. Nothing post-Phase-5 cleared values. The audit's framing "Phase 5 claimed 457 rows backfilled" was accurate but misleading: Phase 5 ran the normalize pass on all 457 rows, the script did what its contract said, and the rows remained ISO-empty by design of the normalizer.

### Trigger function behavior (the smoking gun)

`_normalize_jurisdictions` was tested directly on the suspicious token shapes:

| Input | canonical (returned) | rejected (returned) |
|---|---|---|
| `ARRAY['US-PA']` | `['US-PA']` | `[]` |
| `ARRAY['CA','CA-ON']` | `['CA','CA-ON']` | `[]` |
| `ARRAY['GB','GB-ENG']` | `['GB','GB-ENG']` | `[]` |
| `ARRAY['US']` (control) | `['US']` | `[]` |
| `ARRAY['US-NY']` (control) | `['US-NY']` | `[]` |
| `ARRAY['US','US-PA']` (control) | `['US','US-PA']` | `[]` |

The function returns `RETURNS TABLE(canonical TEXT[], rejected TEXT[])`. It is a single-pass-per-column function that maps text-array-in to text-array-out. **It does NOT derive a parent country code from a subdivision token, and it does NOT cross-populate the ISO column from the text jurisdictions column.** The two columns are treated as parallel inputs of the same shape, each independently canonicalized in place.

### Phase 5 backfill script trace

`BULK_NORMALIZE_AND_ROUTE_SQL` at [fsi-app/scripts/phase-5-backfill.mjs:396-459](fsi-app/scripts/phase-5-backfill.mjs#L396-L459) processes the two columns INDEPENDENTLY:

```sql
CROSS JOIN LATERAL public._normalize_jurisdictions(ii.jurisdictions) n_j
CROSS JOIN LATERAL public._normalize_jurisdictions(ii.jurisdiction_iso) n_iso
...
UPDATE public.intelligence_items ii
   SET jurisdictions = n.j_canon,
       jurisdiction_iso = n.iso_canon
```

`n_iso.canonical` is computed from the EXISTING `jurisdiction_iso` array. For rows where input `jurisdiction_iso` was empty, the normalizer returns an empty array, and the UPDATE writes that empty array back. The script comment at line 384-385 explicitly says "Mirrors migration 082's trigger function routing logic exactly." Phase 5 did exactly what it was specified to do.

### Root cause attribution

**Cause: Trigger semantic gap (the audit's option A).** The system has no automated mechanism to derive `jurisdiction_iso` from canonical `jurisdictions` tokens. Upstream (ingest, agent regeneration) never populated `jurisdiction_iso` for most rows. The trigger and the Phase 5 backfill both treat the two columns as parallel independent inputs.

This is not a Phase 5 script defect. It is not a post-Phase-5 mutation. It is not a scope-filter bug. It is a pre-existing design gap in migration 080 (and preserved in migration 082) that PR #122 surfaced because PR #122 added the post-Phase-5 audit baseline that made the gap visible.

### Critical #1 severity for operator

- **362 of 655 live rows (55%)** carry parseable canonical jurisdictions tokens but empty `jurisdiction_iso`. Any downstream consumer keying on `jurisdiction_iso` (filters, route assignment, ISO-based search, OperationsPage region grouping, MapView geo aggregation) sees those rows as ISO-unknown despite the data being fully canonical in the sibling column.
- The 89 additional rows in the "other / non-ISO shape" bucket have a separate triage pathway via PJR / IR per migration 082.
- The OBS-13 set (5 rows that hit gate 7.2a) is ORTHOGONAL to Critical #1's set. OBS-13 rows have no canonical jurisdictions AND no resolved PJR. Critical #1 rows have canonical jurisdictions but no ISO. The two findings do not overlap and do not supersede each other.

### Critical #1 remediation recommendation

**Steady-state fix, no maintenance window required.**

- Extend `_normalize_jurisdictions` (or add a new helper called from the trigger) to derive a `derived_iso` array from the canonical `jurisdictions` tokens: for each alpha-2 token, emit it; for each `XX-YYY` subdivision token, emit the parent `XX`; union and dedupe; merge into `jurisdiction_iso` only if the column is empty (defensive, preserves operator-curated values).
- One-shot UPDATE on the 362 (or 451) affected rows. Idempotent. No DISABLE TRIGGER bracket required if the new derive step is itself idempotent.
- Lives in a new migration 083 (or whatever number is next after the schema ledger reconciliation; see Critical #2).
- Operator decision: empty-only merge (defensive) vs unconditional re-derive (aggressive). Recommend empty-only.

### PR #122 merge recommendation

**PROCEED with caveat.**

PR #122 did exactly what its design contract said: faithful mirror of the trigger semantic, no regression, snapshot intact, gates 7.2a / 7.2b / 7.2c / 7.2d all passed within their defined scope (7.2a's 5-row failure was the OBS-13 design dependency, not a defect). The Critical #1 audit finding is not a PR #122 defect; it is a pre-existing trigger semantic gap that PR #122 surfaced by snapshotting beforehand.

**Caveat to carry on merge:**

- Note in the merge commit (or PR comment) that 362 to 451 rows remain ISO-empty post-Phase-5 by trigger design; remediation lands in a follow-up migration after the Critical #2 schema ledger reconciliation completes.
- Reference proposed OBS-24 (below) so the follow-up dispatch reads it on its loop-closure pass.
- Critical #2 is a SEPARATE workstream; PR #122 adds no new migrations and does not compound the schema ledger drift. The two are independent.

---

## Critical #2: schema ledger drift (25-migration gap)

### Table presence

| Schema | Table | Exists? |
|---|---|---|
| (any) | `integrity_flags` | **NO** |
| (any) | `recurring_spot_check_log` | **NO** |

`pg_tables`, `information_schema.tables`, and Section A's exact query shape all confirm absence across ALL schemas. Probe for views, materialized views, and functions with those names: also empty. The only related object is `public.recompute_agent_integrity_flag`, a function from migration 035 that operates on `intelligence_items.agent_integrity_flag*` columns (a different feature).

### Section A audit was correct

Lines 37-43 of [fsi-app/scripts/tmp/audit-section-A.mjs](fsi-app/scripts/tmp/audit-section-A.mjs):

```javascript
`SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name = ANY($1)
 ORDER BY table_name`,
[expectedTables]
```

The `expectedTables` array explicitly includes both `integrity_flags` and `recurring_spot_check_log`. The query correctly reported them absent because they are absent. **No false negative.** The operator's hypothesis was wrong; the audit's reconciliation framing ("both reports cannot be correct") was wrong.

Both Section A (truthful about DB state) and Section D (truthful about code references) are correct. The gap between them IS the finding.

### Migration ledger drift

Migrations applied per `supabase_migrations.schema_migrations`: 53 of 78 file-present migrations are recorded.

**Versions 026 through 050 are entirely missing from the ledger.** All 25 migration files exist on disk in [fsi-app/supabase/migrations/](fsi-app/supabase/migrations/). Versions 070 and 078 are also absent.

| Range | Status |
|---|---|
| 001 to 025 | All applied (recorded in schema_migrations) |
| **026 to 050** | **All 25 missing from schema_migrations; files exist on disk** |
| 051 to 069 | All applied |
| 070 | Missing from schema_migrations |
| 071 to 077 | All applied |
| 078 | Missing (expected per OBS-21; PR #117 carryforward) |
| 079 to 082 | All applied |

The applied set jumps from `025` straight to `051`. Migration 048 (`048_integrity_flags_platform.sql`) is present on disk, defines `CREATE TABLE IF NOT EXISTS public.integrity_flags` with schema, indexes, and RLS policies. It was never applied; therefore the table does not exist.

### Partial out-of-band application

Some objects from the missing range DO exist in the live DB:

- `public.recompute_agent_integrity_flag` function exists. Defined in migration 035. Migration 035 is unrecorded.
- Other objects from the 026-050 range may also exist; the investigation did not enumerate them comprehensively.

This pattern suggests at least some of the unrecorded migrations were applied via an out-of-band path (direct `psql`, Supabase dashboard SQL editor, or a script that did not write to `schema_migrations`). The ledger is desynced. The actual database state is unknown without a full object-by-object comparison.

### `recurring_spot_check_log` is worse: no migration source

Code references the table (per Section D and the operator brief at audit time). There is **no migration file anywhere in `supabase/migrations/`** that creates it. The table has never existed at the schema-source level.

### Downstream impact

Migrations 051 through 082 ran against a database missing 25 migrations worth of objects. The `IF NOT EXISTS` and `IF EXISTS` guards in those migrations may have silently masked failures. Migrations that ALTERed or referenced objects from the 026-050 range may have skipped operations silently.

Specifically, migration 082 (Phase 4b operator queue tables and FK constraints) references several objects. Any reference that points to an object from the unrecorded range relies on out-of-band application having created the target. Without a sweep, we do not know which references resolved and which silently skipped.

### Operator-note reconciliation

The operator said "integrity_flags page rendered successfully earlier today with operator-visible data." The DB has no such table. Three possibilities for what the operator saw:

- (a) The page rendered a graceful-degradation empty state that was misread as data.
- (b) The page rendered against per-row `intelligence_items.agent_integrity_flag*` columns from migration 035 (function present in DB; columns presumably also present via out-of-band application) and the operator saw THAT surface, not the missing `integrity_flags` table surface.
- (c) The operator viewed a different environment.

The investigation cannot disambiguate without operator confirmation.

### Critical #2 severity for operator

- **Schema integrity is at unknown state.** The `schema_migrations` ledger does not reflect actual DB content. Any tooling that relies on the ledger to know what migrations have applied (e.g. Supabase CLI, future migration runners, deploy automation) is operating on incorrect information.
- **Phase 7 admin chrome design has an upstream blocker.** OBS-14 (triage UI inline source metadata) and OBS-17 (admin route gate) both assume `integrity_flags` exists as a Phase 7 working surface. It does not. Phase 7 design must either: (1) wait for schema reconciliation that applies migration 048, or (2) scope around the missing table by deferring integrity-flag triage entirely.
- **PR #122 is independent.** PR #122 adds no migrations and does not compound the drift. Its merge is gated only by the Critical #1 caveat, not by Critical #2.

### Critical #2 remediation recommendation

**Reconciliation dispatch (separate from any phase design). Three steps:**

1. **Sweep current DB state.** Enumerate every object (tables, functions, indexes, RLS policies, triggers, types) in the live DB and cross-reference against the file-source migrations 001 through 082. Output: a manifest of "ledger says applied + DB has it", "ledger says not applied + DB has it" (out-of-band), "ledger says not applied + DB does not have it" (genuinely missing), "ledger says applied + DB missing" (rollback never recorded).
2. **Decide reconciliation strategy.** Two options:
   - (a) Apply the missing migrations 026-050 (+ 070) in order against the live DB, accepting that `IF NOT EXISTS` guards will skip already-present objects safely.
   - (b) Backfill the `schema_migrations` ledger with `INSERT` statements that record the missing migrations as applied (only if the sweep in step 1 proves the DB matches what the migrations would have created).
   - Option (a) is safer; option (b) faster.
3. **Author `recurring_spot_check_log` migration source.** Code references the table; create a migration that matches whatever shape the code expects, or remove the code references if the feature was abandoned.

---

## Recommended new OBS (RECOMMENDATION ONLY, NOT YET ADDED)

The original Triage Authorization Packet pre-authorized 7 REC-OBS additions (OBS-17 through OBS-23, committed at [`3d887c0`](https://github.com/Dwarves77/dotfiles/commit/3d887c0)). The Critical investigation findings produce two NEW recommended OBS that are NOT pre-authorized; operator must explicitly authorize before they are added.

### Proposed OBS-24: trigger `_normalize_jurisdictions` does not derive `jurisdiction_iso` from canonical jurisdictions

**Source:** Critical #1 investigation 2026-05-18
**Phase:** 6 (ingest wiring) OR dedicated migration 083 after Critical #2 reconciliation
**Priority:** Medium-High (55% of live rows affected)

The trigger function `_normalize_jurisdictions` is a single-pass-per-column function. It maps text-array-in to text-array-out per column. It does NOT derive a parent country code from a subdivision token, and it does NOT cross-populate the ISO column from the text jurisdictions column. 362 of 655 live rows carry parseable canonical jurisdictions tokens but empty `jurisdiction_iso`. Any downstream consumer keying on `jurisdiction_iso` (filters, route assignment, ISO-based search, MapView geo aggregation) sees those rows as ISO-unknown despite the data being fully canonical in the sibling column.

Phase 5 backfill ran correctly per its contract (faithful mirror of the trigger semantic); no script defect. The gap is in migration 080's design.

**Remediation.** Extend `_normalize_jurisdictions` (or add a helper) to derive `derived_iso` from canonical `jurisdictions` tokens. Defensive merge (empty-only). One-shot UPDATE on affected rows. Idempotent. Lands in a new migration after Critical #2 reconciliation. Cross-references: OBS-4 (implemented; source_column discriminator), OBS-13 (orthogonal; gate 7.2a 5-row set is a different scope), Phase 5 design.

### Proposed OBS-25: 25-migration schema ledger drift (CRITICAL)

**Source:** Critical #2 investigation 2026-05-18
**Phase:** Cross-phase blocker; reconciliation dispatch required BEFORE Phase 6 or Phase 7 design
**Priority:** CRITICAL

`supabase_migrations.schema_migrations` is missing 25 consecutive versions (026 to 050) plus versions 070 and 078. Files exist on disk for all of them. Migration 048 (`integrity_flags` table) is among the unapplied set. Some objects from the unapplied range DO exist in the live DB (e.g. `recompute_agent_integrity_flag` function from migration 035), suggesting out-of-band application via direct `psql` or Supabase SQL editor that did not write to the ledger. The `recurring_spot_check_log` table has NO migration file anywhere despite admin code references. Downstream migrations 051 through 082 ran against a database whose actual state is unknown.

Phase 7 design is blocked: `integrity_flags` does not exist as a Phase 7 surface, contradicting OBS-14 and OBS-17 assumptions. Phase 6 design proceeds only after the reconciliation decision is made.

**Remediation.** Three-step reconciliation dispatch: (1) sweep current DB state and cross-reference against file-source migrations, (2) decide apply-missing vs backfill-ledger, (3) author `recurring_spot_check_log` migration or remove code references. Cross-references: OBS-17 (admin route gate; assumes integrity_flags exists), OBS-14 (triage UI; assumes integrity_flags exists), OBS-21 (migration 078 gap; same root cause family).

---

## Phase 6 and Phase 7 design readiness verdict

**Phase 6 design: NOT READY.** Decision required on Critical #1 remediation approach before Phase 6 brief generation can specify how it writes to `jurisdiction_iso` and `jurisdictions`. Phase 6 design CAN proceed if the operator decides Critical #1 remediation lands in a separate workstream and Phase 6 designs against the current (broken) trigger semantic with a note that the derive step will be added later. Recommend deciding the trigger approach first.

**Phase 7 design: NOT READY.** Critical #2 schema ledger drift means `integrity_flags` does not exist as the table Phase 7 expects. Phase 7 must wait for reconciliation OR explicitly scope around the missing table by deferring integrity-flag triage. Recommend reconciliation first.

**PR #122 merge: PROCEED with caveat.** Per Critical #1 analysis. PR #122 adds no migrations and does not compound Critical #2 drift. Carry a note that 362-451 rows remain ISO-empty by trigger design pending OBS-24 remediation.

**Recommended sequence:**

1. Operator authorizes proposed OBS-24 and OBS-25 (or modifies/rejects).
2. Operator authorizes a schema reconciliation dispatch (Critical #2 remediation).
3. Reconciliation runs: sweep, decide apply-vs-backfill, author missing migration source, commit.
4. Once reconciliation is clean, operator authorizes Critical #1 remediation in a follow-up migration (083 or whatever number is next post-reconciliation).
5. Phase 6 design dispatch can then proceed against a clean schema baseline.
6. Phase 7 design dispatch proceeds in parallel with Phase 6 once integrity_flags exists.

---

## Audit methodology notes

- **Section A audit query was correct.** The audit's framing "both reports cannot be correct" attributed a false negative to Section A; the actual finding is that both reports are correct and the gap between them IS the schema drift. Future audits should not assume a methodology bug without first running the reconciliation check.
- **The audit's 10-row sample for Critical #1 was scope-correct but count-misleading.** The pattern that was observed in 10 rows extrapolated to 451 actual rows. Sample sizes for "is this row state observable" are usually small; sample sizes for "how many rows" need to be all-rows queries.
- **Background-dispatched parallel agents proved effective for forensic investigations.** Two independent DB-dependent investigations ran concurrently; both completed in under 4 minutes total wall-clock; synthesis happened in the main thread. Recommend this pattern for future audit follow-ups.

---

## Status

- REC-OBS additions OBS-17 through OBS-23 committed at [`3d887c0`](https://github.com/Dwarves77/dotfiles/commit/3d887c0).
- Critical #1 root cause: trigger semantic gap (not a script bug); remediation = new helper to derive ISO from canonical; lands in migration after Critical #2 reconciliation.
- Critical #2 escalation: 25-migration ledger drift; integrity_flags genuinely absent; reconciliation dispatch required before Phase 7 design.
- PR #122 merge recommendation: PROCEED with caveat.
- Proposed OBS-24 (trigger semantic gap) and OBS-25 (schema ledger drift) NOT YET ADDED; operator authorizes.
- Phase 6 and Phase 7 design dispatches HELD pending operator decisions on the above.
