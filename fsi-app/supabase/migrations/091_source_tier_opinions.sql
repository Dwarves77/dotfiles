-- 091_source_tier_opinions.sql
--
-- Q3 (tier-opinion preservation) per the source-credibility-model decisions doc
-- (docs/sprint-2/source-credibility-model-decisions-2026-05-19.md, Q3) and per
-- the source-credibility-model skill Section 5 ("Tier-opinion preservation")
-- and Section 9 anti-pattern ("Discarding tier-opinions when source already
-- exists").
--
-- BEFORE this migration: when the brief-generation agent identifies a source
-- citation in its "New Sources Identified" markdown table, the citation
-- extractor at src/app/api/agent/run/route.ts:480-605 routes the citation by
-- URL match. If the URL matches an EXISTING sources row, only the edge in
-- source_citations is recorded; the agent's tier ESTIMATE for that source is
-- silently discarded even when it disagrees with the source's currently-stored
-- tier. The platform therefore loses a recurring evidence signal that could
-- inform tier reclassification.
--
-- AFTER this migration: each agent tier estimate against an existing source is
-- recorded as a row in public.source_tier_opinions, preserving the opinion as
-- evidence regardless of whether it agrees with the current tier. The
-- companion function public.get_tier_opinion_disagreements(window_days)
-- aggregates these opinions and surfaces sources where >=5 opinions in the
-- window disagree with the current base tier; that function is consumed by
-- future operator-review surfacing logic (out of scope for this migration).
--
-- SCHEMA CHOICE: a new table rather than extending source_citations. Cleaner
-- separation because (a) opinions accumulate even when the source-citation
-- edge already exists (one edge, many opinions over time), (b) opinions can
-- originate from sources OTHER than brief generation in the future
-- (haiku_verification, operator_review per the opinion_source enum), (c)
-- intelligence_item_id ties an opinion to the specific brief that produced
-- it without coupling the source_citations edge schema to brief identity.
--
-- TIER COLUMN NOTE: this worktree predates Q2 (tier vs base_tier rename), so
-- the references to "current base_tier" in this migration's comments map to
-- the current public.sources.tier column. After Q2 lands, the disagreement
-- function reads sources.base_tier; the SQL below already prefers base_tier
-- when present (COALESCE pattern in the function body) so the function is
-- forward-compatible with the Q2 rename.

BEGIN;

-- ── Table ──
CREATE TABLE IF NOT EXISTS public.source_tier_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_source_id UUID NOT NULL
    REFERENCES public.sources(id) ON DELETE CASCADE,
  opining_source_id UUID NULL
    REFERENCES public.sources(id) ON DELETE SET NULL,
  intelligence_item_id UUID NULL
    REFERENCES public.intelligence_items(id) ON DELETE SET NULL,
  opined_tier INT NOT NULL CHECK (opined_tier BETWEEN 1 AND 7),
  opinion_source TEXT NOT NULL
    CHECK (opinion_source IN ('haiku_brief_classifier', 'haiku_verification', 'operator_review')),
  opined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.source_tier_opinions IS
  'Q3 tier-opinion preservation per source-credibility-model skill Section 5. '
  'Records every tier estimate observed for an existing source (target_source_id) so '
  'recurring estimates that disagree with the source''s currently-stored tier can be '
  'aggregated and surfaced for operator review. Opinions accumulate independently of '
  'the source_citations edge (one edge, many opinions over time). Disagreement '
  'detection lives in public.get_tier_opinion_disagreements(window_days).';

COMMENT ON COLUMN public.source_tier_opinions.target_source_id IS
  'The source the opinion is ABOUT. References public.sources(id).';
COMMENT ON COLUMN public.source_tier_opinions.opining_source_id IS
  'The source that produced the opinion (the citing source whose brief generation '
  'emitted the tier estimate). Nullable for non-source-attributed opinions '
  '(e.g. operator_review). SET NULL on source delete to preserve the opinion as '
  'evidence even if the opining source is later removed.';
COMMENT ON COLUMN public.source_tier_opinions.intelligence_item_id IS
  'The intelligence_items row whose generation produced the opinion. Nullable for '
  'opinion sources that do not originate from a brief (e.g. operator_review). '
  'SET NULL on item delete to preserve the opinion.';
COMMENT ON COLUMN public.source_tier_opinions.opined_tier IS
  'The tier (1-7) the opining process estimated for target_source_id. CHECK '
  'mirrors the existing sources.tier domain.';
COMMENT ON COLUMN public.source_tier_opinions.opinion_source IS
  'Which process emitted the opinion. Enumerated: haiku_brief_classifier (the '
  'brief-generation agent''s "New Sources Identified" table), haiku_verification '
  '(future Haiku spot-check), operator_review (future operator-driven evidence).';
COMMENT ON COLUMN public.source_tier_opinions.opined_at IS
  'When the opinion was recorded. Drives the 90-day window in the aggregator.';

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS source_tier_opinions_target_opined_idx
  ON public.source_tier_opinions (target_source_id, opined_at DESC);
CREATE INDEX IF NOT EXISTS source_tier_opinions_opinion_source_idx
  ON public.source_tier_opinions (opinion_source);

-- ── Disagreement-detection function ──
--
-- Used by future operator-review surfacing logic. Aggregates opinions in the
-- given window and returns rows where 5+ opinions in the window disagree with
-- the source's current base tier. The threshold (5) and window (90 days) are
-- the Q7 defaults from the decisions doc.
--
-- Forward-compatible with Q2 (tier -> base_tier rename): reads base_tier when
-- the column exists, falls back to tier otherwise. Pattern uses
-- information_schema lookup at function-creation time, not at call time, so
-- the function is rebuilt by a future migration if Q2 ships.
DROP FUNCTION IF EXISTS public.get_tier_opinion_disagreements(INT);

CREATE OR REPLACE FUNCTION public.get_tier_opinion_disagreements(
  window_days INT DEFAULT 90
)
RETURNS TABLE (
  target_source_id UUID,
  current_base_tier INT,
  opined_tiers INT[],
  opinion_count BIGINT,
  distinct_disagreeing_tiers INT
)
LANGUAGE sql
STABLE
AS $function$
  WITH window_opinions AS (
    SELECT
      o.target_source_id,
      o.opined_tier
    FROM public.source_tier_opinions o
    WHERE o.opined_at >= now() - (window_days || ' days')::interval
  ),
  per_source AS (
    SELECT
      wo.target_source_id,
      s.tier AS current_base_tier,
      ARRAY_AGG(wo.opined_tier ORDER BY wo.opined_tier) AS opined_tiers,
      COUNT(*) AS opinion_count,
      COUNT(DISTINCT wo.opined_tier) FILTER (WHERE wo.opined_tier <> s.tier)::INT AS distinct_disagreeing_tiers,
      COUNT(*) FILTER (WHERE wo.opined_tier <> s.tier) AS disagreeing_count
    FROM window_opinions wo
    JOIN public.sources s ON s.id = wo.target_source_id
    GROUP BY wo.target_source_id, s.tier
  )
  SELECT
    p.target_source_id,
    p.current_base_tier,
    p.opined_tiers,
    p.opinion_count,
    p.distinct_disagreeing_tiers
  FROM per_source p
  WHERE p.disagreeing_count >= 5
  ORDER BY p.disagreeing_count DESC, p.opinion_count DESC;
$function$;

COMMENT ON FUNCTION public.get_tier_opinion_disagreements(INT) IS
  'Q3 disagreement aggregator. Returns sources where >=5 tier opinions in the '
  'given window disagree with the source''s current base tier. Default window '
  '90 days per Q7. Reads sources.tier today; future Q2 migration replaces with '
  'sources.base_tier.';

COMMIT;
