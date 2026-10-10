-- subject: Migration 383 (lane DEAD-1c, 2026-10-09): drops section_claim_provenance.verified_by, a column no code reads and whose only writer was the unwired one-time seed script supabase/seed/apply-114.mjs; the drop aborts if any row holds a value, so it never deletes data. APPLIED (production ledger version 20261010122019, as of 2026-10-10).
-- 383 -- drop section_claim_provenance.verified_by (lane DEAD-1c, 2026-10-09).
--
-- APPLIED (production ledger version 20261010122019, as of 2026-10-10). Authored by lane DEAD-1c with no database access; the coordinator's executor applies it after CI is green
-- (two-track policy, CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits;
-- no code depends on this drop, and the seed script edit in the same PR stops writing the column). Requires migration 112
-- (section_claim_provenance, verified_by uuid with no foreign key).
--
-- WHY. Migration 368 (DEAD-2) classified this column UNSURE: retire the unwired seed scripts first. The scan behind this
-- file (git grep of the tracked tree on 2026-10-09, word match verified_by, outside docs/audits and docs/ops):
--   * src, scripts, .discipline, supabase/functions, .github: no reader and no writer. (run-change-detection.mjs names
--     verified_by_read, a different identifier.)
--   * supabase/seed/apply-114.mjs line 310: the one writer, a synthetic CASE 7 inside the one-time script that applied
--     migration 114; no package.json script, workflow or runbook names it. Edited in this PR to set verified_at only.
--   * No database function in the migration tree names the column; this file re-checks the live catalog before dropping.
--   * The Sprint 4 admin verification queue that the design docs (docs/designs/source-provenance-model.md and the sprint 4
--     specs) describe as the producer (recordClaimVerification, /api/admin/verify-claim) does not exist in src or scripts,
--     and the build has no human verification step (no human gates). verified_at stays: validate_item_provenance
--     criterion 6 reads it.
--
-- WHAT THIS DOES. If the column exists: aborts when any row holds a non-null verified_by (a value would be deleted, so the
-- drop then needs a ruling, not a silent loss), aborts when any function in public names the column in its body; then drops
-- the column and re-reads the catalog. If the column is already gone the file is a no-op.
--
-- WHAT THIS DOES NOT DO. No row is updated or deleted. verified_at, the table's triggers and validate_item_provenance are
-- untouched.

BEGIN;

DO $$
DECLARE
  v_present boolean;
  v_nonnull bigint := 0;
  v_fn text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'section_claim_provenance' AND column_name = 'verified_by'
  ) INTO v_present;

  IF v_present THEN
    EXECUTE 'SELECT count(*) FROM public.section_claim_provenance WHERE verified_by IS NOT NULL' INTO v_nonnull;
    IF v_nonnull > 0 THEN
      RAISE EXCEPTION 'ABORT: % section_claim_provenance rows hold a non-null verified_by; dropping the column would delete them', v_nonnull;
    END IF;

    SELECT p.proname INTO v_fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosrc ~ '(^|[^a-z_])verified_by([^a-z_]|$)'
     LIMIT 1;
    IF v_fn IS NOT NULL THEN
      RAISE EXCEPTION 'ABORT: function public.% names verified_by in its body; repoint it before dropping the column', v_fn;
    END IF;
  END IF;
END $$;

ALTER TABLE public.section_claim_provenance DROP COLUMN IF EXISTS verified_by;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'section_claim_provenance' AND column_name = 'verified_by'
  ) THEN
    RAISE EXCEPTION 'SELF-CHECK FAILED: section_claim_provenance.verified_by still exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'section_claim_provenance' AND column_name = 'verified_at'
  ) THEN
    RAISE EXCEPTION 'SELF-CHECK FAILED: section_claim_provenance.verified_at is missing; it must be untouched';
  END IF;
END $$;

COMMIT;
