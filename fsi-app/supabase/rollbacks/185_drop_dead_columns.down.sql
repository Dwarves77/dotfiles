-- Rollback for migration 185 — re-adds the 7 dropped dead columns with their original types/defaults
-- (all were all-NULL / default at drop, so no data backfill). Apply to undo migration 185.

BEGIN;

ALTER TABLE public.intelligence_item_versions ADD COLUMN IF NOT EXISTS created_by_run_id uuid;

ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS operations_decisions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.region_dimension_coverage ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS classification_observed_distribution jsonb;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_observed_at timestamptz;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS spotchecked_at timestamptz;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS spotchecked_by uuid;

COMMIT;
