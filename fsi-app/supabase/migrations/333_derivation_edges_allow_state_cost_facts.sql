-- subject: Migration 333 (lane STATE-COST-DAG, coordinator ruling 2026-09-26/27, "build option A", second
-- half). Widens derivation_edges_from_table_allowed (migration 285's CHECK on public.derivation_edges) to
-- add 'state_cost_facts' to the closed allowlist ('emission_factors', 'market_series',
-- 'regional_data_facts', 'derived_values', 'statutory_computations', 'estimated_values'). Migration 285's
-- own comment states the rule this migration follows verbatim: "closed allowlist... widen deliberately,
-- in a reviewed migration, never by inference." This IS that reviewed migration.
--
-- WHY THIS IS NEEDED (not optional if migration 332 lands alone). `author-edges.mjs::authorEdges` writes
-- a derivation_edges row via `register_derived_value()` (register-derivation.ts) whenever a producer calls
-- it with `figure.table` set to the table the landed figure came from. Migration 332 lets a state_cost_facts
-- row carry a numeric value automate_vs_hire can read; WITHOUT this migration, the FIRST call authoring a
-- state-grain edge would violate this CHECK (23514 check_violation) at the register_derived_value() RPC's
-- own INSERT into derivation_edges, since 'state_cost_facts' is not yet a member. The two migrations are a
-- pair, drafted together per the coordinator's instruction, both held for the SAME sign-off.
--
-- CHECK constraints cannot be ALTERed in place in Postgres; DROP + re-ADD is the only path, same as every
-- other closed-allowlist widen in this schema (entity_refs_ref_table_allowed, migration 283, uses the
-- identical DROP/ADD shape for its own additions).
--
-- WHAT THIS DELIBERATELY DOES NOT DO: no change to derived_values, no change to any other CHECK, no
-- change to RLS (migration 330 already covers derivation_edges' RLS posture), no data write, no backfill.
-- Existing rows are unaffected, none of them reference 'state_cost_facts' yet (0 state-grain edges exist
-- before this migration, by construction, since the table wasn't in the allowlist to write one).
--
-- DO NOT APPLY without operator/coordinator sign-off (R14). This file is DRAFTED for review only.
--
-- POST-APPLY PROOF:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.derivation_edges'::regclass
--       AND conname = 'derivation_edges_from_table_allowed';
--     -- expect: CHECK (from_table = ANY (ARRAY['emission_factors', 'market_series',
--     --   'regional_data_facts', 'derived_values', 'statutory_computations', 'estimated_values',
--     --   'state_cost_facts']))
--   INSERT into a scratch/rolled-back transaction with from_table = 'not-a-real-table'  -- must FAIL
--     (23514 check_violation) confirming the CHECK still rejects everything outside the widened list.
--
-- Reversible: drop the widened CHECK and re-add migration 285's original 6-value CHECK (the rollback
-- file below). A reversal is safe only while zero live derivation_edges rows carry
-- from_table = 'state_cost_facts', the rollback file itself asserts this before dropping.

BEGIN;

ALTER TABLE public.derivation_edges DROP CONSTRAINT IF EXISTS derivation_edges_from_table_allowed;
ALTER TABLE public.derivation_edges ADD CONSTRAINT derivation_edges_from_table_allowed CHECK (
  from_table IN ('emission_factors', 'market_series', 'regional_data_facts', 'derived_values',
                 'statutory_computations', 'estimated_values', 'state_cost_facts')
);

COMMENT ON CONSTRAINT derivation_edges_from_table_allowed ON public.derivation_edges IS
  'Closed allowlist of landed-figure tables a producer may author a DAG edge FROM (spec 08 section 2.2). '
  'Widened by migration 333 to add state_cost_facts (paired with migration 332''s value_numeric column) '
  'so the state-grain automate_vs_hire authorship has a legal from_table to write. Widen deliberately, in '
  'a reviewed migration, never by inference (migration 285''s own rule, unchanged).';

COMMIT;
