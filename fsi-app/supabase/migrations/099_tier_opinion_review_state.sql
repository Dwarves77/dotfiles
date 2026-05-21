-- Migration 099 — tier-opinion review state (Phase 7 admin chrome)
--
-- Background
-- ----------
-- Migration 091 created public.source_tier_opinions and the disagreement
-- aggregator public.get_tier_opinion_disagreements(window_days). The
-- aggregator returns every source where 5+ window-period opinions
-- disagree with the source's current base_tier, but it has no notion of
-- a "reviewed" or "dismissed" state. The Phase 7 admin disagreement
-- review surface needs the aggregator to skip opinions the operator has
-- already triaged so a single dismissal doesn't keep re-surfacing the
-- same source on every dashboard load.
--
-- This migration:
--   1. ADDs source_tier_opinions.dismissed_at + dismissed_by (operator
--      triage). Defaults NULL (untouched opinion).
--   2. REPLACEs get_tier_opinion_disagreements(window_days) to skip
--      rows where dismissed_at IS NOT NULL. Shape unchanged so existing
--      callers compile.
--   3. ADDs an RLS UPDATE policy on source_tier_opinions for
--      platform_admin so the Phase 7 review surface can mark dismissals
--      via a server route. Migration 091 left no UPDATE policy because
--      no operator surface existed.
--
-- Phase 7 admin chrome consumes the aggregator + writes dismissals via
-- /api/admin/sources/tier-opinions (new in same commit).
--
-- ADR-002 coupling
-- ----------------
-- The disagreement review's "accept" action is implemented entirely on
-- the application side: it calls the existing tier-override endpoint to
-- set tier_override = analyst opinion with a reason citing the
-- disagreement, then marks the relevant opinions as dismissed. base_tier
-- is never modified, preserving the classifier's provenance per ADR-002.

BEGIN;

ALTER TABLE public.source_tier_opinions
  ADD COLUMN IF NOT EXISTS dismissed_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS dismissed_by  UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_reason TEXT NULL;

COMMENT ON COLUMN public.source_tier_opinions.dismissed_at IS
  'Operator dismissal timestamp. NULL means the opinion is still in the active disagreement pool. Set via /api/admin/sources/tier-opinions reject action (Phase 7 admin chrome).';

COMMENT ON COLUMN public.source_tier_opinions.dismissed_by IS
  'auth.users.id of the operator who dismissed the opinion.';

COMMENT ON COLUMN public.source_tier_opinions.dismissed_reason IS
  'Optional free-text reason the operator dismissed this opinion. Captured for audit.';

-- Replace the aggregator to filter dismissed opinions out of the
-- disagreement pool. Shape unchanged.
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
      AND o.dismissed_at IS NULL
  ),
  per_source AS (
    SELECT
      wo.target_source_id,
      s.base_tier AS current_base_tier,
      ARRAY_AGG(wo.opined_tier ORDER BY wo.opined_tier) AS opined_tiers,
      COUNT(*) AS opinion_count,
      COUNT(DISTINCT wo.opined_tier) FILTER (WHERE wo.opined_tier <> s.base_tier)::INT AS distinct_disagreeing_tiers,
      COUNT(*) FILTER (WHERE wo.opined_tier <> s.base_tier) AS disagreeing_count
    FROM window_opinions wo
    JOIN public.sources s ON s.id = wo.target_source_id
    GROUP BY wo.target_source_id, s.base_tier
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
  'Q3 disagreement aggregator (091, updated by 099). Returns sources where >=5 non-dismissed tier opinions in the window disagree with the source''s current base tier. Default window 90 days per Q7. Phase 7 admin chrome consumes this for the disagreement review surface.';

-- Index on (target_source_id) WHERE dismissed_at IS NULL to keep the
-- aggregator scan tight as dismissed rows accumulate.
CREATE INDEX IF NOT EXISTS source_tier_opinions_active_by_target_idx
  ON public.source_tier_opinions (target_source_id)
  WHERE dismissed_at IS NULL;

-- RLS: platform_admin can SELECT (already permitted by default; the table
-- has no SELECT policy meaning it's deny-by-default — we add a SELECT
-- policy so the server-route service-role isn't the only read path) and
-- UPDATE to set the dismissal columns.
ALTER TABLE public.source_tier_opinions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS source_tier_opinions_select_platform_admin
  ON public.source_tier_opinions;

CREATE POLICY source_tier_opinions_select_platform_admin
  ON public.source_tier_opinions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

DROP POLICY IF EXISTS source_tier_opinions_update_platform_admin
  ON public.source_tier_opinions;

CREATE POLICY source_tier_opinions_update_platform_admin
  ON public.source_tier_opinions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

COMMIT;
