-- subject: Migration 332 (lane STATE-COST-DAG, coordinator ruling 2026-09-26/27, "build option A"). Adds
-- state_cost_facts.value_numeric NUMERIC, NULLABLE, ADDITIVE, ZERO backfill in this migration, the same
-- three-step discipline migration 267 already states (nullable -> backfill -> NOT NULL, separately
-- reviewed). This is the missing piece the DAG-authorship decision-ready note (docs/ops/session-log.d/
-- 2026-09-26-state-cost-producer.md) named: state_cost_facts got origin_class from migration 267 but
-- never the numeric envelope regional_data_facts got from the SAME migration, so the registered
-- automate_vs_hire method (src/lib/propagation/methods/automate-vs-hire.ts) has never had a column to
-- read a state-grain wage or energy fact FROM, independent of which table its input-resolution accepts.
--
-- NOT the full regional_data_facts envelope (value_numeric, unit, currency, derivation, origin_class,
-- source_key, source_ref, n_observations, method_version, as_at_date, reference_period, 11 columns,
-- migration 267). state_cost_facts already carries unit, origin_class (267), source_id (152) and
-- statute_citation/effective_date (152), its own shape, not regional_data_facts's. The ONE column
-- automate_vs_hire's findFactByDimension actually reads beyond dimension/unit is value_numeric
-- (src/lib/propagation/methods/automate-vs-hire.ts: `typeof row.value_numeric === "number"`), so this
-- migration adds exactly that one column, never a second copy of the wider envelope this table does not
-- need.
--
-- DO NOT APPLY without operator/coordinator sign-off (R14: "we are NOT updating the data on the site, we
-- are building the tools that manage that data first"). This file is DRAFTED for review only.
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'state_cost_facts' AND column_name = 'value_numeric';        -- 1 row
--   SELECT count(*) FROM state_cost_facts WHERE value_numeric IS NOT NULL;             -- 0 (no backfill yet)
--
-- Reversible: `ALTER TABLE public.state_cost_facts DROP COLUMN IF EXISTS value_numeric;` (the rollback
-- file below is the exact inverse; no other column or constraint is touched).

BEGIN;

ALTER TABLE public.state_cost_facts
  ADD COLUMN IF NOT EXISTS value_numeric numeric;

COMMENT ON COLUMN public.state_cost_facts.value_numeric IS
  'Numeric mirror of `value` (TEXT), added so a registered derivation method (automate_vs_hire) can read '
  'a state-grain fact the same way it already reads regional_data_facts.value_numeric (migration 267). '
  'NULLABLE, ADDITIVE, no backfill in this migration; the state-cost-facts producer '
  '(scripts/producers/regional/state-cost-facts-producer.mjs) writes it going forward, mechanically '
  'derived from the same candidate.value every row''s `value` TEXT column already carries, never a second '
  'authored figure.';

COMMIT;
