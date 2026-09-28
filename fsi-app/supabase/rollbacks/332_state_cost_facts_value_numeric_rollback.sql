-- Rollback for migration 332, state_cost_facts.value_numeric. Drops exactly the one column the
-- migration added. Data note: the migration ships with zero backfill (no row is ever written with a
-- non-NULL value_numeric by the migration itself), so rolling back loses no derived or entered data,
-- only the (empty) structure, same posture as migration 267's own rollback. Every pre-existing column
-- (value, unit, trend, source_id, statute_citation, effective_date, origin_class) is untouched by both
-- the migration and this rollback.

BEGIN;

ALTER TABLE public.state_cost_facts DROP COLUMN IF EXISTS value_numeric;

COMMIT;
