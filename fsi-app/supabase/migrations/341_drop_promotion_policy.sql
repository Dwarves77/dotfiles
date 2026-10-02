-- subject: Migration 341 (drop dead table `promotion_policy`, lane R4-5 MIGRATION-TRUTH-CATALOG-DROPS, 2026-10-01, closes CF-DEAD per db-layer census). Drops `public.promotion_policy` (created migration 231, 2026-07-28: `authority`/scoping/quality-floor/budget-envelope/expiry columns, partial unique index `uidx_promotion_policy_single_active`, RLS-ENABLED FROM BIRTH with ZERO named policies - deny-all by omission, the only access path being the `isPlatformAdmin`-gated service-role admin API at `/api/admin/promotion-policy`). Evidence (live-schema export 2026-09-30): 0 rows, ever - no policy row has ever been written, so the FAIL-CLOSED DEFAULT (no active/unexpired policy -> no auto-promotion, no spend) has been the permanent live state since creation. `promotion_policy` appears on `tables_with_rls_but_zero_policies` in the same export, confirming no `CREATE POLICY` was ever added after birth either. This migration drops the table outright; there are no named policies to separately DROP POLICY (RLS-enabled-deny-all means the table carries none), so the DROP TABLE alone removes the entire access surface. The consumer route, `/api/admin/promotion-policy`, is deleted separately by lane R12-13 (remediation-plan-2026-09-30.md Lane 12) in its own commit -- this migration does not touch application code. Pre-check `DO $$` block ABORTS if the table holds even one row. Post-check `DO $$` block asserts the table is gone from `information_schema.tables`. **APPLIED-PENDING** -- coordinator applies (two-track policy, CLAUDE.md standing rule 3); this lane has no DDL-capable Caro's Ledge connection and cannot run or confirm it. Reversible: restore migration 231's `CREATE TABLE public.promotion_policy (...)` body verbatim (no data to recover; the table never held a row).
-- 341 - Drop the dead `promotion_policy` table.
--
-- WHAT GOES, AND WHY. `promotion_policy` (migration 231, 2026-07-28) was built as the authorization
-- record for auto-promotion spend: an `authority` field, scoping columns, quality floors
-- (`require_dual_verified`/`require_firm_core`), a hard-capped budget envelope, and an expiry. Its own
-- fail-closed design meant that with zero rows ever inserted, auto-promotion spend was permanently
-- gated off from the moment the table was created - which is exactly the state the live-schema export
-- confirms: 0 rows, and the table is in the export's `tables_with_rls_but_zero_policies` list, meaning
-- no `CREATE POLICY` statement was ever added after its RLS-enabled-deny-all birth either. Nobody ever
-- authored a policy record; the auto-promotion engine this table was meant to gate never shipped a
-- writer that would create one.
--
-- POLICIES. RLS was enabled from birth with ZERO named policies (deny-all by omission - the admin API
-- route bypasses RLS via the service-role client). There is nothing for this migration to separately
-- `DROP POLICY`; dropping the table removes the entire access surface in one statement.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH. The consumer route `/api/admin/promotion-policy` (the only reader
-- or writer this table ever had) is deleted by a different lane (R12-13, remediation-plan-2026-09-30.md
-- Lane 12, "Delete /api/admin/promotion-policy") in its own commit. This migration is schema-only.
--
-- SAFETY. Same content-gated-tombstone shape as migrations 219/254/261/340: a PRE-CHECK `DO $$` block
-- counts live rows and ABORTS with an explicit RAISE EXCEPTION if the count is greater than zero,
-- because a row appearing after a "0 rows, ever" audit means the premise is wrong and dropping the
-- table would destroy a real policy record, not dead weight. A POST-CHECK `DO $$` block confirms the
-- table is gone from `information_schema.tables`.
--
-- REVERSIBILITY. Structure only, recoverable verbatim from migration 231's own `CREATE TABLE` body (plus
-- its unique index and `ENABLE ROW LEVEL SECURITY`). No data to recover - the table never held a row.

DO $$
DECLARE
  policy_rows bigint;
BEGIN
  -- GATE: the table must still be empty. Any row means the "0 rows, ever" audit no longer holds and
  -- this migration's premise is wrong - stop and re-audit rather than drop a live policy record.
  IF to_regclass('public.promotion_policy') IS NOT NULL THEN
    SELECT count(*) INTO policy_rows FROM public.promotion_policy;
    IF policy_rows > 0 THEN
      RAISE EXCEPTION
        'Migration 341 ABORTED: public.promotion_policy holds % row(s). The "0 rows, ever" premise no '
        'longer holds live - re-audit before dropping this table.', policy_rows;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.promotion_policy;

DO $$
BEGIN
  IF to_regclass('public.promotion_policy') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 341 POST-CHECK FAILED: public.promotion_policy still exists after DROP TABLE.';
  END IF;
END $$;
