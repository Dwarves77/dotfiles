-- Migration 094: Compatibility shim for Q2 (migration 090) tier -> base_tier rename.
--
-- Background
-- ==========
-- Q2 (migration 090, applied 2026-05-19) renamed public.sources.tier to base_tier
-- and added a new effective_tier column. Deployed code at master 537ad38 and
-- earlier still reads public.sources.tier. Without this shim, every sources-table
-- read involving the tier column fails at the PostgREST layer with a column-
-- resolution error, breaking the deployed app in production.
--
-- What this migration does
-- ========================
-- 1. Restores public.sources.tier as a column.
-- 2. Backfills tier = base_tier for all existing rows.
-- 3. Adds CHECK constraints: tier between 1 and 7, and tier matches base_tier.
-- 4. Adds a trigger that keeps tier and base_tier in lockstep on INSERT and UPDATE.
--    Writers may target either column; the trigger propagates to the other.
--
-- Why a trigger and not a generated column
-- ========================================
-- Generated columns in Postgres are read-only. Deployed code includes admin
-- endpoints that WRITE to sources.tier on promote, decide, and bulk-approve.
-- A regular column with a sync trigger preserves both read and write semantics.
--
-- Lifecycle
-- =========
-- This shim is temporary. The Phase 1.5 consumer migration dispatches (per
-- docs/sprint-2/Phase-1.5-consumer-migration-list.md) update ~50 src/ call
-- sites to explicitly read base_tier or effective_tier per consumer intent.
-- Once Phase 1.5 lands, a follow-up migration drops this column, the trigger,
-- and the sync function.

ALTER TABLE public.sources ADD COLUMN tier INT;

UPDATE public.sources SET tier = base_tier;

ALTER TABLE public.sources
  ADD CONSTRAINT sources_tier_check CHECK (tier BETWEEN 1 AND 7),
  ADD CONSTRAINT sources_tier_matches_base_tier CHECK (tier IS NOT DISTINCT FROM base_tier);

CREATE OR REPLACE FUNCTION public.sync_sources_tier_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.base_tier IS NULL AND NEW.tier IS NOT NULL THEN
      NEW.base_tier := NEW.tier;
    ELSIF NEW.tier IS NULL AND NEW.base_tier IS NOT NULL THEN
      NEW.tier := NEW.base_tier;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.base_tier IS NOT DISTINCT FROM OLD.base_tier THEN
      NEW.base_tier := NEW.tier;
    ELSIF NEW.base_tier IS DISTINCT FROM OLD.base_tier AND NEW.tier IS NOT DISTINCT FROM OLD.tier THEN
      NEW.tier := NEW.base_tier;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sources_sync_tier_columns
BEFORE INSERT OR UPDATE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.sync_sources_tier_columns();

COMMENT ON COLUMN public.sources.tier IS
  'COMPATIBILITY SHIM (added 2026-05-19, migration 094). Q2 (migration 090) renamed tier to base_tier; this column is restored as a synced alias to keep deployed code working until Phase 1.5 consumer migration completes. Trigger sources_sync_tier_columns keeps tier and base_tier in lockstep. To be dropped in a follow-up migration once all src/ consumers explicitly reference base_tier or effective_tier per docs/sprint-2/Phase-1.5-consumer-migration-list.md.';

COMMENT ON FUNCTION public.sync_sources_tier_columns() IS
  'Lockstep sync between sources.tier (legacy column) and sources.base_tier (Q2 canonical name). On INSERT, fills whichever of tier or base_tier was not provided from the one that was. On UPDATE, propagates a single-column change to the other. Belt-and-suspenders with the CHECK constraint sources_tier_matches_base_tier. Drops with migration 094 when tier column is removed.';
