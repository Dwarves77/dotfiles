-- 273 — coverage_gap_candidates: record the five live-only columns migration 214 never created
-- (audit 2026-08-31).
--
-- WHY THIS EXISTS. Migration 214 (2026-07-17) created public.coverage_gap_candidates with 16
-- columns: id, rank, instrument, jurisdiction, primary_vertical, transport_mode,
-- freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class,
-- entity_confirmed, authoritative_url, notes, created_by, created_at. Migration 223
-- (2026-07-25, itself a retroactive catch-up for the LIVE view public.acquisition_backlog_v,
-- schema-drift audit RD-49) projects five MORE columns off this table in its SELECT list —
-- data_class, discovery_class, disposition, surface_test, access_model — that no migration file
-- anywhere creates. 223 landing the view without them being clean replay is exactly how the gap
-- stayed invisible: the view is correct against the LIVE table (they were added out-of-band,
-- after 214, before 223's capture on 2026-07-25) but a clean `supabase db reset` replay of the
-- migration history breaks at 223 — CREATE VIEW referencing c.data_class etc. on a table that,
-- replayed from files alone, does not have them. Found in the 2026-08-31 migrations-reality audit
-- (C3 gate) that diffs `supabase/migrations/*.sql` replay output against the live schema.
--
-- THE FIVE COLUMNS AND THEIR EXACT LIVE DEFINITIONS. Dumped live by the coordinator
-- (docs coordinator hand-off, migration-273 ground truth, 2026-08-31) via
-- `information_schema.columns` + `pg_get_constraintdef(oid)` on `public.coverage_gap_candidates`.
-- Types, defaults, nullability and every CHECK below are copied verbatim from that dump, not
-- reconstructed from the view's usage or from guessing at what a reasonable vocabulary would be.
--
-- THIS IS A NO-OP ON THE LIVE DATABASE BY CONSTRUCTION. Every column add is
-- `ADD COLUMN IF NOT EXISTS`; every constraint add is gated behind a `pg_constraint` lookup by
-- `conname` inside a `DO` block. On the live database — where all five columns and all five
-- constraints already exist under these exact names — every guard is false and this migration
-- executes zero DDL. On a clean replay (`supabase db reset`, a fresh shadow database, a new
-- environment built from `supabase/migrations/` alone) every guard is true and this migration
-- constructs exactly what 214 was missing, so 223's CREATE VIEW no longer breaks. Both starting
-- states converge on the same live shape; neither can diverge from it by running this file.
--
-- SAFE BY TIMING. `information_schema.columns` cannot be queried live from this lane (no DB
-- access; ground truth was dumped by the coordinator), so no row-count claim is made here about
-- `coverage_gap_candidates` — the ADD COLUMN forms below are written to be correct regardless of
-- row count: `data_class` is `NOT NULL DEFAULT 'instrument'::text`, so any existing row backfills
-- to the default in the same statement Postgres already handles for `ADD COLUMN ... DEFAULT`
-- without a table rewrite (fast-default, since Postgres 11); the other four columns are added
-- nullable, so no backfill value is invented for them.
--
-- OUT OF SCOPE, DELIBERATELY. This migration does not touch `validate_item_provenance` — the
-- coordinator lands that function's canonical body in a separate migration. It does not touch
-- `acquisition_backlog_v` (223 already carries the correct, byte-matching view definition; this
-- migration only supplies the table structure 223 assumes). It adds no seed data and changes no
-- existing row's value in the four disposition/discovery/access columns.

BEGIN;

-- ── The five columns, guarded (IF NOT EXISTS) ───────────────────────────────────────────────────
ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS data_class text NOT NULL DEFAULT 'instrument'::text;

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS discovery_class text;

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS disposition text;

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS surface_test jsonb;

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS access_model text;

-- ── The five CHECK constraints, guarded by conname via pg_constraint ────────────────────────────
-- Each definition below is the exact `pg_get_constraintdef(oid)` text from the coordinator's live
-- dump. Not hand-simplified, not re-derived from the vocabulary lists in the comment form 214
-- uses elsewhere in this table — copied verbatim so this migration cannot itself introduce drift
-- from the object it exists to record.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coverage_gap_candidates'::regclass
      AND conname = 'coverage_gap_candidates_data_class_check'
  ) THEN
    ALTER TABLE public.coverage_gap_candidates
      ADD CONSTRAINT coverage_gap_candidates_data_class_check
      CHECK ((data_class = ANY (ARRAY['instrument'::text, 'data_feed'::text, 'tracker'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coverage_gap_candidates'::regclass
      AND conname = 'coverage_gap_candidates_discovery_class_check'
  ) THEN
    ALTER TABLE public.coverage_gap_candidates
      ADD CONSTRAINT coverage_gap_candidates_discovery_class_check
      CHECK ((discovery_class = ANY (ARRAY['labor_cost_feed'::text, 'energy_price_feed'::text, 'commercial_fuel_assessment'::text, 'state_subnational_tracker'::text, 'compliance_reporting_portal'::text, 'enforcement_verification_system'::text, 'lca_disclosure_verification'::text, 'market_intel_source'::text, 'research_horizon_source'::text, 'vertical_operational_standard'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coverage_gap_candidates'::regclass
      AND conname = 'coverage_gap_candidates_disposition_check'
  ) THEN
    ALTER TABLE public.coverage_gap_candidates
      ADD CONSTRAINT coverage_gap_candidates_disposition_check
      CHECK (((disposition IS NULL) OR (disposition = ANY (ARRAY['kept'::text, 'declined'::text, 'parked'::text]))));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coverage_gap_candidates'::regclass
      AND conname = 'coverage_gap_candidates_access_model_check'
  ) THEN
    ALTER TABLE public.coverage_gap_candidates
      ADD CONSTRAINT coverage_gap_candidates_access_model_check
      CHECK ((access_model = ANY (ARRAY['free'::text, 'licensed'::text, 'mixed'::text, 'not_applicable'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coverage_gap_candidates'::regclass
      AND conname = 'coverage_gap_candidates_surface_test_required_check'
  ) THEN
    ALTER TABLE public.coverage_gap_candidates
      ADD CONSTRAINT coverage_gap_candidates_surface_test_required_check
      CHECK (((disposition IS NULL) OR (disposition = 'kept'::text) OR ((surface_test IS NOT NULL) AND (surface_test ?& ARRAY['regulations'::text, 'operations'::text, 'market_intel'::text, 'research'::text, 'community'::text]) AND (COALESCE(length((surface_test #>> '{regulations,verdict}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{regulations,reason}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{operations,verdict}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{operations,reason}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{market_intel,verdict}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{market_intel,reason}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{research,verdict}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{research,reason}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{community,verdict}'::text[])), 0) > 0) AND (COALESCE(length((surface_test #>> '{community,reason}'::text[])), 0) > 0))));
  END IF;
END $$;

-- ── Post-check: the five columns and five constraints must exist under these exact names ────────
DO $$
DECLARE
  n_cols int;
  n_cons int;
BEGIN
  SELECT count(*) INTO n_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'coverage_gap_candidates'
    AND column_name IN ('data_class', 'discovery_class', 'disposition', 'surface_test', 'access_model');

  IF n_cols <> 5 THEN
    RAISE EXCEPTION 'ABORT: coverage_gap_candidates has % of the 5 expected columns after migration 273', n_cols;
  END IF;

  SELECT count(*) INTO n_cons
  FROM pg_constraint
  WHERE conrelid = 'public.coverage_gap_candidates'::regclass
    AND conname IN (
      'coverage_gap_candidates_data_class_check',
      'coverage_gap_candidates_discovery_class_check',
      'coverage_gap_candidates_disposition_check',
      'coverage_gap_candidates_access_model_check',
      'coverage_gap_candidates_surface_test_required_check'
    );

  IF n_cons <> 5 THEN
    RAISE EXCEPTION 'ABORT: coverage_gap_candidates has % of the 5 expected named CHECK constraints after migration 273', n_cons;
  END IF;

  RAISE NOTICE 'migration 273 OK: coverage_gap_candidates carries all 5 live-only columns and constraints';
END $$;

COMMIT;
