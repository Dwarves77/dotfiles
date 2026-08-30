-- 267 — origin_class (WO-19) on intelligence_items and state_cost_facts, and the WO-12 number
-- envelope on regional_data_facts. Master execution plan v2, Stage 8 (docs/plans/master-execution-plan-
-- 2026-08-17.md), corrections C1/C2/C4/C8, Addendum 26 operator rulings.
--
-- WHY THIS MIGRATION EXISTS. Migration 258 (2026-08-12) built the number envelope and shipped it on
-- exactly one table, emission_factors — origin_class and derivation as codegen'd CHECKs, both owned by
-- src/lib/contracts/vocabularies.mjs and envelope.mjs respectively. Everywhere else in the schema,
-- provenance is either absent (intelligence_items has 80 columns and none of them says where a value came
-- from) or half-present (regional_data_facts has a free-text `value` column and a source_note that is
-- prose, not a foreign key; state_cost_facts has unit + source_id but no origin_class). This migration
-- extends the SAME two vocabularies outward, through src/lib/contracts/provenance-envelope.mjs — never a
-- second origin_class enum, never a second derivation enum.
--
-- WHAT THIS ADDS:
--   1. intelligence_items.origin_class text — NULLABLE, CHECK against the SAME 7 values as
--      emission_factors.origin_class. NO BACKFILL HERE. The backfill mapping (item_type + source tier ->
--      origin_class) is ratified separately in docs/plans/wo19-origin-class-backfill-mapping.md and runs
--      as its own pass; this migration only makes the column constructable. NOT NULL is deferred to a
--      later migration, after the backfill lands and the residual NULL population is a decision (pre-
--      vocabulary rows), not an accident.
--   2. regional_data_facts gains the full envelope: value_numeric, unit, currency, derivation (+CHECK),
--      origin_class (+CHECK), source_key (FK to the licence register, NOT the existing source_id FK to
--      `sources` — they answer different questions, see provenance-envelope.mjs), source_ref,
--      n_observations, method_version, as_at_date, reference_period. ALL NULLABLE, ALL ADDITIVE. NO
--      BACKFILL HERE: operator ruling (Addendum 26) is that the 75 existing free-text rows are RE-KEYED
--      through this envelope (option A — re-derive value_numeric/unit/source_key from each row's
--      source_note URL where possible), not grandfathered as permanent prose. That re-keying is priced,
--      guarded work for a separate pass; this migration only builds the columns it re-keys INTO. The
--      legacy `value` text column is untouched and stays the display source for any row not yet re-keyed.
--   3. state_cost_facts.origin_class text — NULLABLE, CHECK against the same 7 values. state_cost_facts is
--      already the envelope precedent at small scale (13/13 rows carry unit AND source_id per Appendix A
--      of the master plan); this is the one dimension it was missing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   NO NOT NULL anywhere. NO backfill anywhere (rule per WO-12 step 3 / WO-19 step 2: nullable ->
--   backfill -> NOT NULL are three separate, separately-reviewed steps; collapsing them risks exactly the
--   "confidently wrong" failure mode factor-tier.mjs's own header warns about for an inverted DQI scale).
--   NO widening of the 7-value origin_class or the 9-value derivation vocabulary (Addendum 26, binding:
--   "the 7-value vocabulary is NOT widened. Backfill stamps what is derivable from source metadata; NULL
--   is explicitly documented as pre-vocabulary").
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'intelligence_items' AND column_name = 'origin_class';        -- 1 row
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'regional_data_facts'
--       AND column_name IN ('value_numeric','unit','currency','derivation','origin_class',
--                            'source_key','source_ref','n_observations','method_version',
--                            'as_at_date','reference_period');                          -- 11 rows
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'state_cost_facts' AND column_name = 'origin_class';           -- 1 row
--   SELECT count(*) FROM intelligence_items WHERE origin_class IS NOT NULL;             -- 0 (no backfill yet)
--   SELECT count(*) FROM regional_data_facts WHERE origin_class IS NOT NULL;            -- 0 (no backfill yet)
--   SELECT count(*) FROM state_cost_facts WHERE origin_class IS NOT NULL;               -- 0 (no backfill yet)
--   INSERT ... origin_class = 'not-a-real-value' on any of the three tables                    -- must FAIL
--     (23514 check_violation) on the relevant *_origin_class_check constraint.
--
-- DDL IS GENERATED. scripts/gen/migration-267-origin-class-and-envelope.mjs splices the three GENERATED
-- blocks below from src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL(); do not hand-edit inside
-- the markers. Reversible: supabase/rollbacks/267_origin_class_and_envelope_rollback.sql (drops all three
-- CHECK constraints and all columns this migration adds; the legacy `value`/`unit`/`source_id` columns
-- on all three tables are untouched by both this migration and its rollback).
--
-- Two-track policy (CLAUDE.md standing rule 3): schema DDL applies via the sanctioned lane BEFORE the
-- dependent backfill code merges. This migration is schema-only — no data write, no backfill, no code
-- dependency — so it is safe to apply as soon as it is reviewed; the backfill in
-- docs/plans/wo19-origin-class-backfill-mapping.md is a SEPARATE, later, operator-ratified pass.

-- ── intelligence_items: origin_class (WO-19) ────────────────────────────────────────────────────────
-- >>> GENERATED: intelligence_items_origin_class >>>
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS origin_class text;

ALTER TABLE public.intelligence_items ADD CONSTRAINT intelligence_items_origin_class_check CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

COMMENT ON COLUMN public.intelligence_items.origin_class IS 'Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class (migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being forced into the weakest class it might not deserve.';
-- <<< END GENERATED: intelligence_items_origin_class <<<

-- ── regional_data_facts: the full number envelope (WO-12) ──────────────────────────────────────────
-- >>> GENERATED: regional_data_facts_envelope >>>
ALTER TABLE public.regional_data_facts
  ADD COLUMN IF NOT EXISTS value_numeric numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS derivation text,
  ADD COLUMN IF NOT EXISTS origin_class text,
  ADD COLUMN IF NOT EXISTS source_key text REFERENCES public.data_sources(source_key),
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS n_observations integer,
  ADD COLUMN IF NOT EXISTS method_version text,
  ADD COLUMN IF NOT EXISTS as_at_date date,
  ADD COLUMN IF NOT EXISTS reference_period text;

ALTER TABLE public.regional_data_facts ADD CONSTRAINT regional_data_facts_derivation_check CHECK (derivation IN ('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated', 'interpolated', 'modelled', 'estimated'));

ALTER TABLE public.regional_data_facts ADD CONSTRAINT regional_data_facts_origin_class_check CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

ALTER TABLE public.regional_data_facts ADD CONSTRAINT regional_data_facts_n_observations_positive_check CHECK (n_observations IS NULL OR n_observations > 0);

COMMENT ON COLUMN public.regional_data_facts.value_numeric IS 'The number itself, decomposed out of a legacy free-text display column. NULL means this row has not been re-keyed through the envelope yet; a legacy text column (where one exists on the table) remains the display source until it is.';

COMMENT ON COLUMN public.regional_data_facts.unit IS 'Unit of value_numeric (e.g. "EUR/tonne", "index_points", "USD/hour"). Required to interpret value_numeric; a populated value_numeric with a NULL unit is a malformed envelope, not a valid one — enforced at the write path (this migration does not add a DB-level co-nullability CHECK, so a later hardening pass may).';

COMMENT ON COLUMN public.regional_data_facts.currency IS 'ISO 4217 currency code, where `unit` denotes a monetary rate. NULL for a non-monetary fact.';

COMMENT ON COLUMN public.regional_data_facts.derivation IS 'How value_numeric was produced (IOSCO PD391 2.3(a)): statutory_fixed | statutory_formula | observed | transacted_index | assessed | calculated | interpolated | modelled | estimated. Same 9-value vocabulary as emission_factors.derivation (migration 258), owned by src/lib/contracts/envelope.mjs DERIVATION — this column never defines a second one.';

COMMENT ON COLUMN public.regional_data_facts.origin_class IS 'Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class (migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being forced into the weakest class it might not deserve.';

COMMENT ON COLUMN public.regional_data_facts.source_key IS 'The licence-cleared external dataset this value came from, joined through the SAME licence register emission_factors.source_key already uses (public.data_sources / licence_clear_sources). Deliberately not the `sources` table other columns on this row may already reference — that FK is the trust-tier register for editorial content, a different question from which redistributable dataset supplied a number.';

COMMENT ON COLUMN public.regional_data_facts.source_ref IS 'The table, row, page or series id within the source, so a reader can check the figure without re-deriving it.';

COMMENT ON COLUMN public.regional_data_facts.n_observations IS 'Sample size behind an aggregated figure, where the derivation is an aggregate. Governs significant-figure rounding at render (see envelope.mjs significantFigures()).';

COMMENT ON COLUMN public.regional_data_facts.method_version IS 'Version tag of the method that produced value_numeric, when derivation is calculated/modelled/estimated. Lets a later method change be told apart from a data change in the same series.';

COMMENT ON COLUMN public.regional_data_facts.as_at_date IS 'When the source asserted this value (not when we ingested it, not when the underlying event occurred — envelope.mjs''s as-of triple keeps those three questions separate).';

COMMENT ON COLUMN public.regional_data_facts.reference_period IS 'The period value_numeric describes (e.g. "2026-Q2", "2026-07"), for a fact that is a period aggregate rather than a point-in-time observation.';
-- <<< END GENERATED: regional_data_facts_envelope <<<

-- ── state_cost_facts: origin_class, completing the envelope dimension it was missing ───────────────
-- >>> GENERATED: state_cost_facts_origin_class >>>
ALTER TABLE public.state_cost_facts
  ADD COLUMN IF NOT EXISTS origin_class text;

ALTER TABLE public.state_cost_facts ADD CONSTRAINT state_cost_facts_origin_class_check CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

COMMENT ON COLUMN public.state_cost_facts.origin_class IS 'Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class (migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being forced into the weakest class it might not deserve.';
-- <<< END GENERATED: state_cost_facts_origin_class <<<

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_ii_cols  int;
  n_rdf_cols int;
  n_scf_cols int;
BEGIN
  SELECT count(*) INTO n_ii_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'origin_class';
  SELECT count(*) INTO n_rdf_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'regional_data_facts'
      AND column_name IN ('value_numeric', 'unit', 'currency', 'derivation', 'origin_class',
                           'source_key', 'source_ref', 'n_observations', 'method_version',
                           'as_at_date', 'reference_period');
  SELECT count(*) INTO n_scf_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'state_cost_facts' AND column_name = 'origin_class';

  IF n_ii_cols <> 1 THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.origin_class did not land (found % matching columns)', n_ii_cols;
  END IF;
  IF n_rdf_cols <> 11 THEN
    RAISE EXCEPTION 'ABORT: regional_data_facts envelope incomplete (found % of 11 columns)', n_rdf_cols;
  END IF;
  IF n_scf_cols <> 1 THEN
    RAISE EXCEPTION 'ABORT: state_cost_facts.origin_class did not land (found % matching columns)', n_scf_cols;
  END IF;

  RAISE NOTICE 'migration 267 OK: origin_class on intelligence_items + state_cost_facts, full envelope on regional_data_facts, all nullable, zero rows backfilled';
END $$;
