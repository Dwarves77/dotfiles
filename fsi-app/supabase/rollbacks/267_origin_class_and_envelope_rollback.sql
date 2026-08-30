-- Rollback for migration 267 — origin_class (WO-19) + regional_data_facts number envelope (WO-12).
-- Drops every CHECK constraint and every column the migration added, on all three tables. Data note: this
-- migration never backfilled anything (zero rows ever carried a non-NULL value in an added column at the
-- point this rollback can run), so rolling back loses no derived or entered data — only the (empty)
-- structure. The legacy columns each table already had (intelligence_items' 80 pre-existing columns,
-- regional_data_facts.value/status/trend/source_id/source_note, state_cost_facts.unit/source_id/
-- statute_citation/effective_date) are UNTOUCHED by both the migration and this rollback.

BEGIN;

-- ── state_cost_facts ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.state_cost_facts DROP CONSTRAINT IF EXISTS state_cost_facts_origin_class_check;
ALTER TABLE public.state_cost_facts DROP COLUMN IF EXISTS origin_class;

-- ── regional_data_facts ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.regional_data_facts DROP CONSTRAINT IF EXISTS regional_data_facts_n_observations_positive_check;
ALTER TABLE public.regional_data_facts DROP CONSTRAINT IF EXISTS regional_data_facts_origin_class_check;
ALTER TABLE public.regional_data_facts DROP CONSTRAINT IF EXISTS regional_data_facts_derivation_check;

ALTER TABLE public.regional_data_facts
  DROP COLUMN IF EXISTS reference_period,
  DROP COLUMN IF EXISTS as_at_date,
  DROP COLUMN IF EXISTS method_version,
  DROP COLUMN IF EXISTS n_observations,
  DROP COLUMN IF EXISTS source_ref,
  DROP COLUMN IF EXISTS source_key,
  DROP COLUMN IF EXISTS origin_class,
  DROP COLUMN IF EXISTS derivation,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS value_numeric;

-- ── intelligence_items ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_origin_class_check;
ALTER TABLE public.intelligence_items DROP COLUMN IF EXISTS origin_class;

COMMIT;
