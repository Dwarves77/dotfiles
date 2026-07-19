-- Migration 215 — drop the dormant source_conflicts table (dormant-systems purge P-6, 2026-07-18)
--
-- The source_conflicts surface was dormant end-to-end: 0 rows, NO writer (openSourceConflict was
-- removed 2026-07-11 as zero-caller), and its only reader (fetchOpenConflicts in supabase-server.ts)
-- plus its store slice, the "Data Conflicts" admin tab, and the computeConflictResolutionImpact
-- promotion/demotion engine (test-only caller) were all removed in the same PR that commits this
-- migration. The open_conflicts VIEW that read this table was already dropped by migration 180.
--
-- Ruled purge by the operator (R2, 2026-07-18) under "the old needs to be purged if not used".
-- Tombstone-then-delete: for a schema object (not a corpus item), the permanent record is this
-- committed migration file + the migrations-inventory entry; there is no row data to snapshot (the
-- CONTENT GATE below asserts the table is empty and ABORTS the drop if it is not — the stop-if-live-
-- data-was-missed guard). DROPping the table also drops its RLS policies (migration 005:
-- source_conflicts_read / source_conflicts_admin_write / source_conflicts_admin_update) by cascade.
--
-- BREAK-RISKY CLASS (ADR-011): a DROP TABLE is destructive and dev=prod (direct SQL reaches
-- production), so this migration is AUTHORED, NOT self-applied — it rides the operator's DDL window.
-- Until applied, the table sits empty and fully orphaned (no code references it after this PR).
-- Reversible by re-creating the table from migration 004 + its RLS from migration 005 (both retained
-- in history); no data is lost because the table is empty.

DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.source_conflicts') IS NULL THEN
    RAISE NOTICE 'source_conflicts already absent — nothing to drop.';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM public.source_conflicts;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ABORT: source_conflicts holds % row(s); the dormant-systems audit recorded it as 0-row. Investigate before dropping (a live writer was missed).', n;
  END IF;

  DROP TABLE public.source_conflicts CASCADE;
  RAISE NOTICE 'Dropped dormant table source_conflicts (0 rows) + its RLS policies via cascade.';
END $$;
