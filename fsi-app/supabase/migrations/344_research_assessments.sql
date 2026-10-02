-- subject: Migration 344 (Lane W2-R RESEARCH-ASSESSMENT-MODEL, 2026-10-01). Adds research_assessments,
-- the new table docs/specs/03-research.md section 1 names as the surface's atomic unit ("the assessment,
-- not the paper"). DDL SKETCH ONLY -- AUTHORED, NOT APPLIED (two-track policy, CLAUDE.md standing rule
-- 3). The coordinator applies this via the Supabase CLI before the dependent producer/reader commit
-- (src/lib/research/assess.mjs, scripts/producers/research/research-assessment-producer.mjs) writes any
-- real row.
--
-- WHY THIS EXISTS. Operator ruling 2026-10-01 ("Why is research have a design but not a build? Fix
-- this.") overrides decision 4 of 2026-09-25 (design now, build after the four-question structure):
-- Research is built now. docs/specs/03-research.md section 10's own gap table names "Maturity triple"
-- and "Horizon band and trigger" as Absent -- this migration is the schema half of closing that gap.
--
-- SHAPE. One current row per (item_id), with a self-FK `supersedes` chain carrying prior versions
-- forward (spec section 7 row 11, "assessment history ledger... append-only and visible" -- a row is
-- never UPDATEd in place to change a scored value; a new row is inserted with `supersedes` pointing at
-- the row it replaces, and the old row's `is_current` flips to false in the SAME transaction). Keyed to
-- intelligence_items(id); the dispatch scopes this to research_finding (the surface's native item_type)
-- plus technology/innovation items that surface_of.mjs routes to Research under the domain=7 rule (see
-- src/lib/research/surface-candidate.mjs) -- enforced at the APPLICATION layer by the producer (it only
-- ever builds a row for an item surfaceOf() already admitted to 'research'), not by a DB-side item_type
-- CHECK, because surfaceOf's own admission rule is itself an (item_type, domain) function the DB cannot
-- evaluate inline without duplicating that logic at the schema layer (the exact drift class surface-
-- candidate.mjs's own header documents for the research candidate prefilter).
--
-- TWO SCORES, NEVER MERGED (spec section 4). `credibility_evidence_score` (the IPCC-shaped evidence x
-- agreement read) and `credibility_authority_score` (the source-authority distribution) are separate
-- columns, never combined into one field or one number -- the spec's own acceptance criterion 4 ("source
-- authority renders as a distribution, never a mean") is why the authority score is jsonb, not a scalar.
--
-- MATURITY AS A CORRIDOR, NEVER A POINT (spec section 2, "product rules"). technical_maturity_low/high
-- (IEA-extended TRL 1-11) and commercial_maturity_low/high (ARENA CRI 1-6) are two-ended ranges by
-- construction (CHECK low <= high); a single-value reading is represented as low = high, never collapsed
-- to one column. Each carries its own `_method` (free text: the basis, e.g. "R1: dated statutory
-- instrument" or "inferred from forward-event obligation_text") and `_evidence_ids` (the claim/forward-
-- event ids the corridor was read from -- text[], never invented, CLAUDE.md rule 2).
--
-- HORIZON: BAND + RULE + CONFIDENCE (spec section 3). `horizon_band` is the coarse,
-- always-attempted read (NOW/NEAR/MID/FAR); `horizon_kind` labels which of the three horizons
-- (availability/economic/obligation) the row is quoting, per spec's own instruction ("label which one
-- you are quoting"). `horizon_rule` records which of the R1-R4 cascade rules fired (spec section 3's own
-- list), and `horizon_confidence` is forced to 'low' whenever `horizon_rule = 'R4'` (enforced by
-- src/lib/research/assess.mjs, not re-asserted as a cross-column DB CHECK here -- Postgres CHECK
-- constraints cannot reference the rule->confidence mapping without hardcoding the ladder into SQL a
-- second time, the same one-authority-not-two posture surface-candidate.mjs documents for its own split).
-- `horizon_band` and `horizon_rule` are BOTH nullable together: the mandatory refusal state (spec section
-- 6, "a first-class UI state that says not forecastable") is represented by horizon_band IS NULL AND
-- horizon_rule IS NULL AND refusal_reason IS NOT NULL, never by a sentinel string standing in for null.
--
-- STATUS TOKEN (CLAUDE.md rule 14). Every row states CONFIRMED or HYPOTHESIS; REFUTED is not a value
-- here because a refuted assessment is retracted by a new row (supersedes-chain), not by relabeling the
-- old row in place -- the append-only ledger rule (spec section 7 row 11) and rule 14's "corrected IN
-- PLACE, never silently deleted" apply at the ROW level (supersede + keep), not by mutating this column.
--
-- RLS: mirrors derived_values (migration 285) -- RLS enabled, no SELECT policy on the raw table for
-- anon/authenticated (deliberate deny-by-default), SELECT granted on `research_assessments_current`
-- instead, a non-security_invoker view scoped to `is_current = true`. A role with no grant at all on the
-- base table can still read through the view (ordinary Postgres view-owner-privilege semantics; see
-- migration 285's own RLS section for the full mechanism). Writes are service-role only (the Supabase
-- client used by the producer authenticates with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS/grants
-- entirely, same posture as every other guarded-write table in this schema) -- no INSERT/UPDATE policy
-- for authenticated or anon is created, matching derived_values's own "no policy for authenticated"
-- stance.
--
-- REVERSIBLE: `DROP VIEW IF EXISTS public.research_assessments_current; DROP TABLE IF EXISTS
-- public.research_assessments;` -- safe, 0 rows exist before this migration applies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.research_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  supersedes uuid REFERENCES public.research_assessments(id),
  is_current boolean NOT NULL DEFAULT true,

  -- ── maturity triple (spec section 2), corridors only, never a point ──
  technical_maturity_low smallint CHECK (technical_maturity_low BETWEEN 1 AND 11),
  technical_maturity_high smallint CHECK (technical_maturity_high BETWEEN 1 AND 11),
  technical_maturity_method text,
  technical_maturity_evidence_ids text[] NOT NULL DEFAULT '{}',
  commercial_maturity_low smallint CHECK (commercial_maturity_low BETWEEN 1 AND 6),
  commercial_maturity_high smallint CHECK (commercial_maturity_high BETWEEN 1 AND 6),
  commercial_maturity_method text,
  commercial_maturity_evidence_ids text[] NOT NULL DEFAULT '{}',

  CONSTRAINT research_assessments_technical_corridor_order
    CHECK (technical_maturity_low IS NULL OR technical_maturity_high IS NULL OR technical_maturity_low <= technical_maturity_high),
  CONSTRAINT research_assessments_commercial_corridor_order
    CHECK (commercial_maturity_low IS NULL OR commercial_maturity_high IS NULL OR commercial_maturity_low <= commercial_maturity_high),

  -- ── horizon (spec section 3): band + kind + rule + confidence, or a first-class refusal ──
  horizon_kind text CHECK (horizon_kind IN ('availability', 'economic', 'obligation')),
  horizon_band text CHECK (horizon_band IN ('NOW', 'NEAR', 'MID', 'FAR')),
  horizon_rule text CHECK (horizon_rule IN ('R1', 'R2', 'R3', 'R4')),
  horizon_confidence text CHECK (horizon_confidence IN ('low', 'medium', 'high')),
  horizon_trigger_note text,
  refusal_reason text,

  CONSTRAINT research_assessments_horizon_or_refusal CHECK (
    (horizon_band IS NOT NULL AND horizon_rule IS NOT NULL AND refusal_reason IS NULL)
    OR (horizon_band IS NULL AND horizon_rule IS NULL AND refusal_reason IS NOT NULL)
  ),

  -- ── credibility, two scores, never merged (spec section 4) ──
  credibility_evidence_score text CHECK (credibility_evidence_score IN ('limited', 'medium', 'robust')),
  credibility_authority_score jsonb,

  computed_by text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  status_token text NOT NULL CHECK (status_token IN ('CONFIRMED', 'HYPOTHESIS')),

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.research_assessments IS
  'Lane W2-R, migration 344. Spec 03''s atomic unit for /research: one current row per item_id (research_finding, '
  'plus technology/innovation items surfaceOf() routes to research), superseded chain carried via `supersedes` '
  '(spec section 7 row 11, append-only history). Never hand-edited; written only by '
  'scripts/producers/research/research-assessment-producer.mjs through the guarded path.';

CREATE INDEX IF NOT EXISTS research_assessments_item_id_idx ON public.research_assessments(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS research_assessments_one_current_per_item_idx
  ON public.research_assessments(item_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS research_assessments_supersedes_idx ON public.research_assessments(supersedes);

-- ── RLS - deny the raw table, grant the view (mirrors migration 285's derived_values posture) ──
ALTER TABLE public.research_assessments ENABLE ROW LEVEL SECURITY;
-- No SELECT policy on research_assessments for anon/authenticated: deliberate.

CREATE OR REPLACE VIEW public.research_assessments_current AS
SELECT ra.*
FROM public.research_assessments ra
WHERE ra.is_current;

COMMENT ON VIEW public.research_assessments_current IS
  'The ONE view Research''s read path selects from (src/lib/research/read-assessments.mjs). Runs with the '
  'DEFINER''s row-visibility, not the querying role''s -- deliberately NOT security_invoker, the same '
  'mechanism migration 285''s derived_values_admissible documents for itself. Enforce via code review: a '
  'new reader of research_assessments (the raw table) outside src/lib/research/ is the defect class this '
  'view exists to prevent.';

GRANT SELECT ON public.research_assessments_current TO authenticated;

DO $$
DECLARE
  n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_assessments';
  IF n_cols <> 24 THEN
    RAISE EXCEPTION 'migration 344 self-check failed: research_assessments has % columns, expected 24', n_cols;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'research_assessments_current'
  ) THEN
    RAISE EXCEPTION 'migration 344 self-check failed: research_assessments_current view was not created';
  END IF;
END $$;

COMMIT;

-- Rollback: BEGIN; DROP VIEW IF EXISTS public.research_assessments_current; DROP TABLE IF EXISTS public.research_assessments; COMMIT;
