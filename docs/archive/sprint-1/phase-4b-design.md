# Sprint 1 Phase 4b: Operator Queue Tables + Rejected-Token Routing

**Date:** 2026-05-17
**Migration:** `082_operator_queues_and_routing.sql`
**Branch:** `feat/sprint-1-phase-4b`
**Status:** Authored, awaiting operator review
**Predecessor:** PR #119 (Phase 4a) merged 2026-05-17 18:34 UTC as commit `a5a1854`

This doc explains the design choices in migration 082. The migration itself carries the operational comments and CHECK constraints; this doc explains the WHY for choices that aren't obvious from the SQL.

## What 4b ships

1. `ingest_rejections` table (RC-7 fragment audit log)
2. `pending_jurisdiction_review` table (existing-row triage queue) with DEFERRABLE FK
3. RLS policies on both tables referencing `profiles.is_platform_admin` (per Q2 correction in `phase-3-operator-decision.md`, NO Postgres role)
4. Replacement of `_intelligence_items_normalize_jurisdictions` trigger function to route rejected tokens via `_classify_jurisdiction_token` (SECURITY DEFINER so it bypasses queue-table RLS)
5. Populate `pending_jurisdiction_review` with 107 (item, token) pairs across 72 distinct items per pre-flight (`phase-4b-schema-introspect.json`)

## Design decisions

### D1. DEFERRABLE INITIALLY DEFERRED on `pending_jurisdiction_review.intelligence_item_id`

The trigger fires BEFORE INSERT on `intelligence_items`. The trigger needs to write to `pending_jurisdiction_review` referencing `NEW.id`, but `NEW.id` is only set as a row-default at that point, the row is not yet in the heap. A standard FK check during BEFORE INSERT would fail because the parent row does not exist yet.

Three options were considered:
- **A. Session variable handoff (`set_config` / `current_setting`).** BEFORE trigger stashes rejected tokens; AFTER trigger reads them and writes to queue. Works but couples two trigger functions via a string-encoded transaction-local config. Extra moving parts.
- **B. Transient `_jurisdiction_routing_staging` table.** BEFORE writes here without an FK; AFTER reads and writes to real queue. More moving parts than A.
- **C. `DEFERRABLE INITIALLY DEFERRED` on the FK.** BEFORE trigger writes to queue directly; FK check defers to COMMIT, by which time the parent row exists. Single trigger function. Standard PostgreSQL pattern for this case.

Going with C. Performance cost is negligible (FK check happens once per transaction at COMMIT regardless of trigger frequency). The DEFERRABLE clause is documented inline so future readers see the rationale.

### D2. SECURITY DEFINER on the trigger function

The trigger is invoked when any caller INSERTs/UPDATEs `intelligence_items`. The caller might be:
- service_role (bypasses RLS) — no issue
- A workspace-internal user inserting via the community-promote path — RLS allows their `intelligence_items` write but denies their `ingest_rejections` / `pending_jurisdiction_review` write
- A future code path using a member-level role

Without SECURITY DEFINER, the trigger would fail for case 2 because the caller cannot write to the queue tables (RLS denies). Marking the function SECURITY DEFINER runs it with the function owner's privileges (typically postgres), which bypasses RLS on the queue tables.

`search_path` is pinned to `public, pg_temp` to prevent search-path injection (a standard hygiene step for SECURITY DEFINER functions).

This does NOT compromise the queue tables' isolation. The trigger only writes rows derived from `intelligence_items` data; it cannot be invoked directly by users. Read/Update access remains gated to platform admins via RLS.

### D3. Partial unique index on `pending_jurisdiction_review`

Repeated UPDATEs on the same `intelligence_items` row would re-fire the trigger and re-INSERT the same (item, token, column) tuple into the queue. Without dedup, the queue grows without bound for any row that gets UPDATEd repeatedly.

The fix: `CREATE UNIQUE INDEX pjr_unresolved_unique_idx ... WHERE resolved_at IS NULL`. Trigger uses `ON CONFLICT (...) WHERE resolved_at IS NULL DO NOTHING`. Once the operator resolves a flag, the unique slot is freed; if ingest re-introduces the bad value post-resolution, a new flag is created (legitimate audit signal that ingest is producing the bad value despite the resolution).

`ingest_rejections` has NO such dedup. Each rejection event is recorded; the audit value IS the event count. Operator triages each occurrence (or bulk-triages by raw_value in Phase 7).

### D4. `source_column` on `pending_jurisdiction_review` (OBS-4 carryforward)

Per OBS-4 in `followups.md`, the trigger routes rejected tokens from BOTH `intelligence_items.jurisdictions` AND `intelligence_items.jurisdiction_iso`. Phase 7 triage needs to know which column the rejected token came from so it can write the operator's chosen canonical replacement back to the right column.

Added `source_column TEXT NOT NULL DEFAULT 'jurisdictions' CHECK IN ('jurisdictions','jurisdiction_iso')`. Default matches the most common case so existing tests / scripts that don't specify don't break.

### D5. Triage-state consistency CHECKs

Both tables include a CHECK constraint enforcing that triage / resolution state is either fully populated or fully empty:

- `ingest_rejections`: `triage_action`, `triaged_by`, `triaged_at` all NULL OR all NOT NULL
- `pending_jurisdiction_review`: `resolved_at`, `resolved_by` both NULL OR both NOT NULL (resolution_value may be NULL when operator discarded)

Catches partial-write bugs at the schema layer rather than relying on UI to maintain the invariant. The Phase 7 triage modal MUST write all three triage fields together.

### D6. No DELETE policy

Both tables intentionally have no DELETE policy. Rows are retained for audit. Triage is a write-once flag, not a delete.

If the operator decides to discard a flagged value, they write `triage_action = 'discarded'` (ingest_rejections) or `resolved_at NOT NULL, resolution_value = NULL` (pending_jurisdiction_review). The row stays.

Retention policy is "indefinite for Sprint 1" per `phase-3-operator-decision.md`. The 90-day archive followup applies after 5,000 rows.

### D7. CASCADE on `pending_jurisdiction_review.intelligence_item_id`

If an `intelligence_items` row is hard-deleted (which only happens during Phase 5 dedup transactions or Phase 11 close, per operator decisions), the corresponding pending_jurisdiction_review rows are CASCADE-deleted. This matches Phase 2's CASCADE classification for related child tables.

`SET NULL` was not chosen because a pending_jurisdiction_review row referring to a deleted item is meaningless (the operator cannot triage against a row that no longer exists).

### D8. ON DELETE SET NULL on auth.users FKs

`ingest_rejections.triaged_by` and `pending_jurisdiction_review.resolved_by` use `ON DELETE SET NULL`. If a platform admin user account is deleted, the triage history is retained but the actor reference goes null. Preserves the audit trail of "this was triaged" without holding a hard FK to a possibly-rotated user account.

## What 4b does NOT ship

- Phase 5 backfill of the canonical-entity columns (next phase).
- Phase 5 dedup transactions per cluster.
- Phase 5 backfill of jurisdictions / jurisdiction_iso for the 460 ISO-empty rows.
- Phase 6 ingest wiring (classifier-item-type populates `instrument_type` / `instrument_identifier`; jurisdiction validator runs at ingest).
- Phase 7 triage UI (the operator-facing chrome that reads these queue tables).

Per OBS-1 in `followups.md`, Phase 5 backfill MUST wait for 4b apply, otherwise unmapped tokens in existing rows are silently lost during re-normalization.

## Pre-flight evidence

From `fsi-app/scripts/tmp/phase-4b-schema-introspect.json` (run 2026-05-17 against the post-080 production DB):

- `intelligence_items` columns confirmed: `source_id uuid NULL`, `source_url text NOT NULL`. Trigger has the source context it needs to populate `ingest_rejections`.
- Function signatures post-080: `_normalize_jurisdictions` returns `TABLE(canonical text[], rejected text[])`; `_classify_jurisdiction_token` returns text; `_intelligence_items_normalize_jurisdictions` returns trigger. All as expected.
- Counts to populate: continent=48, region_bucket=38, undefined_group=21. Total 107 token-rows across 72 distinct items.
- Existing queue tables: zero. Safe to CREATE TABLE without conflict.

## Reversibility

DROP both tables CASCADE (removes FKs, indexes, RLS). Then `CREATE OR REPLACE` the trigger function with migration 080's body (the rejected-discarding 4a version). The canonical-entity columns (079) and CASE extension (080) are unaffected.

Single-command rollback is not provided as part of this migration to avoid accidental invocation; it would need to be written explicitly as a follow-up migration if rollback is required.

## Apply protocol

Standard: `node fsi-app/supabase/seed/apply-pending.mjs`. Single migration file (082). Idempotency is NOT guaranteed for this migration (CREATE TABLE without IF NOT EXISTS); re-running on a partially-applied state would error. This matches the project convention for table-creating migrations.

If the migration partially applies (e.g., ingest_rejections created but pending_jurisdiction_review fails), use `ROLLBACK` (the file is wrapped in BEGIN/COMMIT) and inspect the error. The pre-flight confirmed both tables absent, so no partial-state risk on first apply.

## Verification after apply

After successful apply, expected DB state:
- `\d+ public.ingest_rejections` shows table + 4 CHECK constraints + 2 indexes + RLS enabled.
- `\d+ public.pending_jurisdiction_review` shows table + 3 CHECK constraints + DEFERRABLE FK + 3 indexes (including the partial unique) + RLS enabled.
- `SELECT COUNT(*) FROM public.pending_jurisdiction_review` returns 107 (the populate result).
- `SELECT COUNT(*) FROM public.ingest_rejections` returns 0 (no ingest events yet).
- `SELECT prosecdef FROM pg_proc WHERE proname = '_intelligence_items_normalize_jurisdictions'` returns `t` (SECURITY DEFINER).
- Negative test: as a non-platform-admin user, `INSERT INTO public.ingest_rejections (...)` returns RLS denied.
- Positive test: as a platform admin, `SELECT * FROM public.pending_jurisdiction_review LIMIT 1` returns a row.
