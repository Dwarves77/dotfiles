# W1.B — Staged-update approval handler: root cause + fix

## Scope

24 rows in `staged_updates` are `status='approved'` AND `update_type='new_item'`
but no corresponding row exists in `intelligence_items`. The approval handler
flipped them to "approved" yet the intel item was never produced and no error
was preserved.

## Files inspected

- `fsi-app/src/app/api/staged-updates/route.ts` — the only approval handler
  (no `[id]/route.ts`, no `[id]/approve/route.ts`, no `admin/staged-updates/...`).
  `Glob fsi-app/src/app/api/**/staged*/**/route.ts` returns this single file.
- `fsi-app/supabase/migrations/004_source_trust_framework.sql` — defines the
  `staged_updates` table that's actually live (the 001 version is dropped at
  line 478 of 004 and re-created with `update_type`/`proposed_changes`).
- `fsi-app/supabase/migrations/005_rls_trust_framework.sql` — RLS forces
  `service_role` for INSERT/UPDATE on `staged_updates` and `intelligence_items`.
  The handler uses `getServiceClient()` so RLS is satisfied; not the bug.

## Root cause (single paragraph)

The original handler did the two writes in the **wrong order and without
coupling**: it FIRST flipped `staged_updates.status = 'approved'`, THEN called
`applyUpdate()` which performed the `INSERT INTO intelligence_items`. When the
insert failed (typically because `proposed_changes` carried fields that don't
exist on `intelligence_items` — e.g. legacy `key_deadlines`, `source_name`, or
schema drift such as a missing required `domain` / mismatched `item_type` enum
value), the function returned a 500 to the caller, but the staged_updates row
was already marked approved. There was no `materialization_error` column to
record the failure, no transaction wrapping the two writes, and no idempotency
check on retry — so the row sat orphaned forever. Any later attempt to
re-approve hit the `if (update.status !== "pending") return 409` guard, making
the orphans unreachable from the UI without manual intervention.

## Bugs in the original handler

Line numbers refer to the pre-fix `route.ts`.

1. **Status flip happens before materialization** (lines 92-100 → 106-114).
   Failure of the second write leaves `status='approved'` with no intel row.
   No transaction, no rollback.
2. **No error column.** `applyUpdate()` returns `{ success: false, error }`
   to the HTTP layer but nothing is persisted. The 500 response is the only
   evidence the failure ever happened.
3. **No idempotency.** `if (update.status !== "pending") return 409` (line 85)
   blocks retry of an orphan. Because the original code provides no separate
   "retry materialization" path, orphans cannot self-heal.
4. **Field-stripping is fragile.** `const { key_deadlines, source_name,
   why_matters, ...insertData } = update.proposed_changes;` strips three
   fields then re-adds `why_matters` if truthy — empty strings are silently
   dropped. Any *other* unknown field in `proposed_changes` (worker drift,
   schema migration drift) fails the insert with a Postgres error.
5. **`why_matters` re-add logic is incoherent.** It removes via destructure,
   then re-adds via `if (why_matters) insertData.why_matters = why_matters` —
   a no-op when present, a silent drop when empty. The original intent was
   probably to rename a different worker key; the rename was never finished.
6. **`proposed_changes` not null-checked.** If a worker writes a row with
   NULL `proposed_changes`, the destructure throws — caught by the outer
   try/catch and reported as a generic 500.

## What the fix does

(See `fsi-app/src/app/api/staged-updates/route.ts` post-edit.)

1. **Reorder writes.** Materialize FIRST, then update `staged_updates`.
   The status flip + materialization-status columns are written in a single
   `UPDATE` so they cannot diverge.
2. **Persist failures.** Migration 034 adds `materialization_error TEXT`,
   `materialized_at TIMESTAMPTZ`, `materialized_item_id UUID`. On failure
   the handler writes `status='approved'` (intent is durable) +
   `materialized_at=NULL` + `materialization_error=<reason>` and returns 500.
   The audit script + W4 backfill use the partial index
   `idx_staged_updates_unmaterialized` to find these rows.
3. **Idempotency on retry.** A re-POST against an already-approved-and-
   materialized row returns `{ success: true, idempotent: true,
   materialized_item_id }` — no duplicate insert. A re-POST against an
   already-approved-but-NOT-materialized row re-runs `applyUpdate` and the
   `new_item` branch checks `intelligence_items.legacy_id` (UNIQUE) before
   inserting, returning the existing id if present.
4. **Defensive null handling** on `proposed_changes`, `proposed_changes.status`,
   etc. — every error path returns a structured `{ success: false, error }`
   instead of throwing.
5. **`new_item` returns the new `id`** so it can be written into
   `materialized_item_id`. This unblocks W4 (manual orphan re-materialization)
   and gives the dashboard a forward link from review → intel.

## Out of scope (deliberately)

- **Re-materializing the existing 24 orphans.** The instructions say W4 owns
  per-orphan manual review. The audit script identifies them; the fix
  prevents new ones; W4 will run the actual recovery.
- **Atomic transactions.** Supabase JS client doesn't expose a multi-statement
  transaction; a true transaction would require a Postgres function or
  `pg`-direct call. Given that the most common failure mode is the FIRST
  write (intel insert), the new ordering achieves the same goal in practice:
  if the intel insert fails we never write `materialized_at`, and the
  audit/retry path picks it up. A follow-up could move both writes into a
  single `rpc()` call for true atomicity if the rare second-write failure
  becomes a problem.

## Callsites I could not trace through

None. The route is the single ingress and `applyUpdate` is local to the file.
There is no caller in `src/` invoking `applyUpdate` directly.
