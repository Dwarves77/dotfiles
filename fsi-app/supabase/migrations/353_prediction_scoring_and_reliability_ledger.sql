-- subject: Migration 353 (lane L4-D, 2026-10-05, ADR-044 decision 4, learning-loop-design-2026-09-25 sections 3 and 4): `signposts` gains the prediction columns (`inference_record_id`, `outcome` held|refuted|partial, `outcome_assessed_at`, `scored_by`) and `source_reliability_ledger` is created, append-only, one row per source per scored prediction, RLS on with no customer policy; NOT APPLIED. The ledger is evidence; it never writes a tier (src/lib/trust.ts reads it as one more delta inside the existing clamp).
-- 353 -- prediction scoring columns on signposts, and the source reliability ledger (lane L4-D, 2026-10-05).
--
-- NOT APPLIED. Authored by lane L4-D; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3),
-- before src/lib/learning/prediction-scoring.mjs scores a real row. Until then every reader tolerates the
-- columns and the table being absent (prediction-scoring.mjs falls back to the six base signposts columns and
-- reports scoring_skipped_columns_absent; trust.ts treats a failed ledger read as no outcome evidence).
-- Requires migrations 282 (entities), 338 (inference_records), 344 and 346 (research_assessments, signposts)
-- and 004 (sources).
--
-- (a) signposts becomes a prediction (learning-loop-design section 3: "prediction extends the signposts shape").
--   inference_record_id   nullable FK to inference_records: the inference a forward-looking claim came from.
--                         No writer sets it yet (an assessment-derived signpost has no inference); the column
--                         exists so an inference-derived signpost can carry the link without another migration.
--   outcome               held | refuted | partial, NULL until scored.
--   outcome_assessed_at   when it was scored.
--   scored_by             the method id and version that scored it, e.g. signpost_watch@1.0.0.
--   The three score columns are set together or not at all (signposts_score_columns_together).
--
-- (b) source_reliability_ledger (ADR-044 decision 4). One row per source per scored prediction, written by
-- src/lib/learning/prediction-scoring.mjs when a signpost is scored: the sources of the assessed item's
-- grounded FACT and LEGAL claims (section_claim_provenance.source_id) join through
-- signposts.assessment_id -> research_assessments.item_id. APPEND-ONLY: a trigger refuses UPDATE and DELETE
-- (a correction is a new fact, never an edit, the same posture as migration 258's emission_factors and
-- ADR-043's outbox). UNIQUE (source_id, signpost_entity_id) makes the scorer's retry idempotent. RLS is
-- enabled and NO policy exists: the table is read and written by the service role only (no customer reads
-- another source's reliability record, and no customer writes one).
-- The ledger NEVER writes sources.effective_tier or any tier. trust.ts tallies a source's rows over the
-- window and turns the tally into one more delta inside decideEffectiveTier's clamp; tier_override wins.
-- source_trust_events needs no new event_type: a movement is recorded as tier_promotion or tier_demotion
-- (migration 004's CHECK) with details.rules naming prediction_outcomes.
--
-- SELF-CHECK. Column and constraint presence, RLS on, no policy on the ledger, the append-only trigger, and an
-- ADVERSARIAL check (CLAUDE.md standing rule 15: a guard is proven by attack, not by presence): the append-only
-- function is attached to a throwaway TEMP table shaped like the ledger, a row is inserted, and an UPDATE and a
-- DELETE are each attempted and must be refused. The temp table is dropped with the sub-transaction.
--
-- Reversible: DROP TABLE public.source_reliability_ledger; DROP FUNCTION public.source_reliability_ledger_append_only();
--   ALTER TABLE public.signposts DROP CONSTRAINT signposts_score_columns_together,
--     DROP COLUMN inference_record_id, DROP COLUMN outcome, DROP COLUMN outcome_assessed_at, DROP COLUMN scored_by;

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.signposts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.signposts does not exist, migration 346 must be applied first';
  END IF;
  IF to_regclass('public.inference_records') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.inference_records does not exist, migration 338 must be applied first';
  END IF;
  IF to_regclass('public.research_assessments') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.research_assessments does not exist, migration 344 must be applied first';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist';
  END IF;
END $$;

-- (a) signposts: the prediction columns
ALTER TABLE public.signposts
  ADD COLUMN IF NOT EXISTS inference_record_id uuid REFERENCES public.inference_records(inference_id),
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('held', 'refuted', 'partial')),
  ADD COLUMN IF NOT EXISTS outcome_assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scored_by text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signposts_score_columns_together' AND conrelid = 'public.signposts'::regclass) THEN
    ALTER TABLE public.signposts ADD CONSTRAINT signposts_score_columns_together CHECK (
      (outcome IS NULL AND outcome_assessed_at IS NULL AND scored_by IS NULL)
      OR (outcome IS NOT NULL AND outcome_assessed_at IS NOT NULL AND scored_by IS NOT NULL)
    );
  END IF;
END $$;

COMMENT ON COLUMN public.signposts.inference_record_id IS
  'Nullable FK to the inference_records row whose forward-looking claim this signpost tracks (learning-loop-design section 3). Unset for an assessment-derived signpost.';
COMMENT ON COLUMN public.signposts.outcome IS
  'held | refuted | partial, NULL until scored. A fired signpost scores by direction (confirms held, refutes refuted, delays partial); an expectation date (predicate.by) that passes with no firing scores refuted. Written once by src/lib/learning/prediction-scoring.mjs.';
COMMENT ON COLUMN public.signposts.outcome_assessed_at IS 'When the outcome was scored.';
COMMENT ON COLUMN public.signposts.scored_by IS 'The method id and version that scored the outcome, e.g. signpost_watch@1.0.0.';

CREATE INDEX IF NOT EXISTS signposts_unscored_idx ON public.signposts (watches) WHERE outcome IS NULL;

-- (b) the source reliability ledger
CREATE TABLE IF NOT EXISTS public.source_reliability_ledger (
  id                 bigserial PRIMARY KEY,
  source_id          uuid NOT NULL REFERENCES public.sources(id),
  signpost_entity_id text NOT NULL REFERENCES public.signposts(entity_id),
  assessment_id      uuid NOT NULL REFERENCES public.research_assessments(id),
  outcome            text NOT NULL CHECK (outcome IN ('held', 'refuted', 'partial')),
  scored_at          timestamptz NOT NULL DEFAULT now(),
  scored_by          text NOT NULL,
  CONSTRAINT source_reliability_ledger_one_per_source_signpost UNIQUE (source_id, signpost_entity_id)
);

COMMENT ON TABLE public.source_reliability_ledger IS
  'Append-only evidence (ADR-044 decision 4): one row per source per scored prediction. The sources are those of the assessed item''s grounded FACT and LEGAL claims. Written only by src/lib/learning/prediction-scoring.mjs. Never writes a tier: src/lib/trust.ts tallies it as one more delta inside the existing clamp, and tier_override wins.';

CREATE INDEX IF NOT EXISTS source_reliability_ledger_source_idx ON public.source_reliability_ledger (source_id, scored_at);

CREATE OR REPLACE FUNCTION public.source_reliability_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: a correction is a new row, never an edit or a delete (%)', TG_TABLE_NAME, TG_OP;
END $$;

DROP TRIGGER IF EXISTS source_reliability_ledger_append_only_trg ON public.source_reliability_ledger;
CREATE TRIGGER source_reliability_ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON public.source_reliability_ledger
  FOR EACH ROW EXECUTE FUNCTION public.source_reliability_ledger_append_only();

-- RLS on, no policy: service role only.
ALTER TABLE public.source_reliability_ledger ENABLE ROW LEVEL SECURITY;

-- Self-check
DO $$
DECLARE
  n_cols_sp   int;
  n_cols_led  int;
  n_pol       int;
  v_rls       boolean;
  v_refused_u boolean := false;
  v_refused_d boolean := false;
BEGIN
  SELECT count(*) INTO n_cols_sp FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'signposts'
     AND column_name IN ('inference_record_id', 'outcome', 'outcome_assessed_at', 'scored_by');
  IF n_cols_sp <> 4 THEN
    RAISE EXCEPTION 'ABORT: signposts has % of the 4 prediction columns', n_cols_sp;
  END IF;

  SELECT count(*) INTO n_cols_led FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'source_reliability_ledger';
  IF n_cols_led <> 7 THEN
    RAISE EXCEPTION 'ABORT: source_reliability_ledger has % columns, expected 7', n_cols_led;
  END IF;

  SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = 'public.source_reliability_ledger'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'ABORT: RLS is not enabled on source_reliability_ledger'; END IF;
  SELECT count(*) INTO n_pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'source_reliability_ledger';
  IF n_pol <> 0 THEN RAISE EXCEPTION 'ABORT: source_reliability_ledger must have no customer policy, found %', n_pol; END IF;

  IF (SELECT count(*) FROM public.source_reliability_ledger) <> 0 THEN
    RAISE EXCEPTION 'ABORT: source_reliability_ledger is not empty at migration time';
  END IF;

  -- Attack: the append-only function must refuse an UPDATE and a DELETE of a row it guards.
  BEGIN
    CREATE TEMP TABLE l4d_353_fixture (LIKE public.source_reliability_ledger INCLUDING DEFAULTS) ON COMMIT DROP;
    CREATE TRIGGER l4d_353_selfcheck_trg BEFORE UPDATE OR DELETE ON l4d_353_fixture
      FOR EACH ROW EXECUTE FUNCTION public.source_reliability_ledger_append_only();
    INSERT INTO l4d_353_fixture (source_id, signpost_entity_id, assessment_id, outcome, scored_by)
      VALUES (gen_random_uuid(), 'cl:signpost:00000000000000f1', gen_random_uuid(), 'held', 'selfcheck');
    BEGIN
      UPDATE l4d_353_fixture SET outcome = 'refuted';
    EXCEPTION WHEN raise_exception THEN v_refused_u := true;
    END;
    BEGIN
      DELETE FROM l4d_353_fixture;
    EXCEPTION WHEN raise_exception THEN v_refused_d := true;
    END;
    IF NOT v_refused_u THEN RAISE EXCEPTION 'ABORT: the append-only guard let an UPDATE through'; END IF;
    IF NOT v_refused_d THEN RAISE EXCEPTION 'ABORT: the append-only guard let a DELETE through'; END IF;
    RAISE EXCEPTION 'l4d_353_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'l4d_353_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 353 OK: signposts prediction columns (4), source_reliability_ledger (% columns), append-only guard attacked and held, RLS on with no policy, 0 rows', n_cols_led;
END $$;

COMMIT;
