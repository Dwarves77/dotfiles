-- Migration 092: source_bias_tags table (Q4 bias tag vocabulary)
--
-- Why this migration exists.
-- Per the Q4 decision captured in
-- `docs/sprint-2/source-credibility-model-decisions-2026-05-19.md` and the
-- canonical model in
-- `fsi-app/.claude/skills/source-credibility-model/SKILL.md` Section 6, bias
-- on `sources` is captured as orthogonal multi-value tags across three
-- dimensions (Funding / Methodological Orientation / Stakeholder Position)
-- rather than a single bias column or an extension of `source_role`.
--
-- A dedicated tags table is the chosen shape because:
--   - A single column collapses three independent axes into one and forces
--     false binaries ("is ICCT 'advocacy' or 'research'?").
--   - Extending `source_role` conflates role (what the source IS) with bias
--     (what its institutional and methodological orientation is).
--   - Multi-value per dimension is the operator-stated requirement (ICCT
--     example: foundation-funded + methodologically-transparent +
--     independent-research + environmental-advocate).
--
-- Vocabulary is VERBATIM from the operator's decision (Q4). Twenty-two tags
-- partitioned across three dimensions. Iteration of the vocabulary is an
-- open sub-decision in the decisions doc; this migration captures the v1
-- vocabulary as a CHECK constraint scoped per dimension. A future migration
-- can replace the CHECK with a vocabulary lookup table if the vocabulary
-- starts to churn.
--
-- Assignment-source vocabulary models the Q4 hybrid pipeline:
--   - haiku_auto_high_confidence: Haiku assigned, confidence >= 0.80, no
--     operator action required (default-trust the classifier)
--   - haiku_proposed_low_confidence: Haiku assigned, 0.65 <= confidence
--     < 0.80, queued for operator review
--   - operator_confirmed: Haiku proposal that an operator reviewed and
--     accepted; promotion from haiku_proposed_low_confidence to a stable
--     state
--   - operator_set: Operator-authored without a Haiku proposal as the
--     starting point (manual entry or override)
--
-- Idempotent re-runs must skip rows with assignment_source LIKE 'operator_%'
-- since those reflect human judgment; that semantic is enforced at the
-- batch-script layer (not in the schema), since the schema must allow the
-- operator path to overwrite a stale low-confidence Haiku proposal.

BEGIN;

-- The vocabulary is grouped by dimension in the CHECK constraint so the
-- schema rejects (dimension, tag) pairs that cross dimensions (e.g. inserting
-- `peer-reviewed` against dimension='funding' fails). This keeps the
-- partition contract enforced in the database, not just in application code.

CREATE TABLE public.source_bias_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  tag TEXT NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  assignment_source TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_bias_tags_dimension_chk
    CHECK (dimension IN ('funding', 'methodology', 'stakeholder')),
  CONSTRAINT source_bias_tags_assignment_source_chk
    CHECK (assignment_source IN (
      'haiku_auto_high_confidence',
      'haiku_proposed_low_confidence',
      'operator_confirmed',
      'operator_set'
    )),
  -- Partition the vocabulary by dimension. Twenty-two tags total, split
  -- 7 + 7 + 8 across funding / methodology / stakeholder per Q4 verbatim.
  CONSTRAINT source_bias_tags_vocabulary_chk CHECK (
    (dimension = 'funding' AND tag IN (
      'industry-funded',
      'government-funded',
      'foundation-funded',
      'subscription-supported',
      'academic-institutional',
      'mixed-funded',
      'funding-opaque'
    ))
    OR
    (dimension = 'methodology' AND tag IN (
      'peer-reviewed',
      'methodologically-transparent',
      'analytical-synthesis',
      'editorial-opinion',
      'advocacy',
      'factual-reporting',
      'standards-defining'
    ))
    OR
    (dimension = 'stakeholder' AND tag IN (
      'industry-incumbent',
      'industry-challenger',
      'regulator-aligned',
      'environmental-advocate',
      'independent-research',
      'customer-perspective',
      'labor-perspective',
      'investor-perspective'
    ))
  ),
  -- A given source carries each (dimension, tag) at most once. Multi-value
  -- per dimension is enforced via multiple rows sharing source_id +
  -- dimension with different tag values.
  CONSTRAINT source_bias_tags_unique_per_source UNIQUE (source_id, dimension, tag)
);

-- Index for per-source lookups (the dominant read pattern: render bias
-- tags for a source on the candidate review surface, on Research surface
-- per the Q9 signal set, anywhere else the bias tags get rendered).
CREATE INDEX source_bias_tags_source_id_idx
  ON public.source_bias_tags (source_id);

-- Composite index for per-source-per-dimension scans (e.g. "show me all
-- funding tags for source X"). The unique constraint above already covers
-- (source_id, dimension, tag) but a separate (source_id, dimension)
-- index keeps narrower scans cheap.
CREATE INDEX source_bias_tags_source_dimension_idx
  ON public.source_bias_tags (source_id, dimension);

-- Partial index for the review queue: rows pending operator confirmation
-- (i.e. low-confidence Haiku proposals). The review UI scans for these
-- frequently; the partial index keeps the scan tight (50-150 rows
-- expected per the Q7 + Q4 backlog math vs the full table size of N tags
-- per source x 796 sources = 2000-5000 rows estimated).
CREATE INDEX source_bias_tags_review_queue_idx
  ON public.source_bias_tags (assignment_source)
  WHERE assignment_source = 'haiku_proposed_low_confidence';

COMMENT ON TABLE public.source_bias_tags IS
  'Q4: bias tags on sources, three dimensions (funding / methodology / stakeholder), multi-value within each. Per source-credibility-model SKILL.md Section 6. Vocabulary verbatim from operator decision.';

COMMENT ON COLUMN public.source_bias_tags.dimension IS
  'One of funding / methodology / stakeholder. Vocabulary partitioned per source_bias_tags_vocabulary_chk.';

COMMENT ON COLUMN public.source_bias_tags.tag IS
  'Lower-case kebab-case bias tag from the Q4 vocabulary. Validity enforced per dimension by source_bias_tags_vocabulary_chk.';

COMMENT ON COLUMN public.source_bias_tags.confidence IS
  'Classifier confidence in this assignment, 0.00 to 1.00. NULL for operator_set rows where confidence is not applicable.';

COMMENT ON COLUMN public.source_bias_tags.assignment_source IS
  'How this row was created: haiku_auto_high_confidence (>=0.80), haiku_proposed_low_confidence (0.65-0.80, awaits operator confirm), operator_confirmed (operator accepted a haiku proposal), operator_set (operator-authored).';

GRANT SELECT ON public.source_bias_tags TO anon, authenticated;
GRANT ALL ON public.source_bias_tags TO service_role;

COMMIT;
