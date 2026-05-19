-- Migration 086: Analytical press routing for the 8 named sources.
--
-- Purpose: route analytical-press content (trade journals, sustainability
-- reporting outlets, industry analyst commentary) into the Research surface
-- per caros-ledge-platform-intent SKILL.md Section 3 ("Research is horizon-scan
-- content with analytical or quantitative depth ... Industry analytical press
-- with named editorial provenance"). Differentiation from institutional
-- research (academic_research, standards_body, intergovernmental_body) is
-- carried in sources.source_role; Research surface UI consumes source_role as
-- a tag/badge/filter signal.
--
-- The four-category source taxonomy in environmental-policy-and-innovation
-- stays unchanged. NO 5th category. NO change to the sources.category CHECK
-- constraint (introduced in migration 084). Analytical-press content is
-- category='research' with source_role='trade_press' (axis 1 per the 5-axis
-- classification framework from migration 063); tier is INTEGER (1-7) per
-- the original sources.tier shape from migration 004 and the environmental-
-- policy-and-innovation source-classification hierarchy (tier 5 = news
-- reporting; tier 6 = analysis/opinion).
--
-- Operator-default tier per outlet (correctable later):
--   Reuters Sustainable Business -> tier 5 (news reporting, named bureau analytics)
--   All other 7                  -> tier 6 (analysis / opinion / horizon-scan commentary)
--
-- Cross-reference: migration 084 already routes these 8 names to
-- category='research' via the URL/name-LIKE backfill (lines 47-57). This
-- migration codifies the source_role + tier on each row so future routing
-- decisions can read the data layer alone rather than relying on the
-- name-LIKE exception code path. Once Build 7 (Market Intel signal
-- aggregation), Build 8 (Research horizon-scan), Build 11 (Dashboard)
-- consume sources.source_role as a tag/badge/filter (per Build 8 fold-in
-- note in docs/sprint-2/sprint-2-planning-2026-05-18.md), the data layer
-- becomes the canonical store.
--
-- Idempotent: re-running the migration is safe. UPDATE clauses are
-- predicate-guarded so they only touch rows whose current state does not
-- match the target. INSERT clauses use NOT EXISTS guards.
--
-- Sources-schema-touch precondition (sprint-followups-discipline SKILL.md):
-- audit pre-flight scoped four code-path families. No consumer assumes a
-- divergent shape. tier is universally INTEGER 1-7 in src/types/source.ts,
-- src/lib/trust.ts, src/components/sources/**. source_role is consumed
-- read-only in src/lib/supabase-server.ts (line 779 family) for Path 2
-- routing exception code, in src/app/operations/page.tsx (line 21 comment),
-- and in src/components/market/PolicySignals.tsx (line 50 comment) -- all
-- treat it as the v1 TEXT vocabulary from migration 063. No consumer
-- assumes a CHECK constraint exists or assumes a particular value beyond
-- 'trade_press'/'statistical_data_agency'/'intergovernmental_body' for
-- the Path 2 exception mapping.

BEGIN;

-- ============================================================================
-- 1. UPDATE existing rows: align source_role + tier for the 8 analytical-press
--    sources that are already in public.sources (per pre-flight A1 evidence).
-- ============================================================================

-- Loadstar: matches "The Loadstar" (2 rows: tier 4 + tier 5)
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 6,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%loadstar%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 6
       OR category IS DISTINCT FROM 'research');

-- FreightWaves (covers FreightWaves Sustainability per dispatch naming;
-- live DB has plain "FreightWaves" rows + duplicates with no Sustainability
-- variant). Routes to Research per platform-intent skill Section 3.
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 6,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%freightwaves%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 6
       OR category IS DISTINCT FROM 'research');

-- GreenBiz: matches "GreenBiz" + "GreenBiz (Trellis Group)"
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 6,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%greenbiz%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 6
       OR category IS DISTINCT FROM 'research');

-- Splash247: matches "Splash247" + "Splash247 (Asia Shipping Media)"
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 6,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%splash247%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 6
       OR category IS DISTINCT FROM 'research');

-- Supply Chain Digital: matches "BizClik Media (Supply Chain Digital)"
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 6,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%supply chain digital%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 6
       OR category IS DISTINCT FROM 'research');

-- Reuters Sustainable Business: tier 5 (news reporting per dispatch).
-- NOTE: scope to "%reuters sustainable%" but EXCLUDE any future
-- "Sustainable Switch" newsletter row (which platform-intent skill places
-- in Market Intel). Live DB currently has "Reuters Sustainable Business"
-- (1 row, tier 4) only; no Switch row exists; the LIKE excludes 'switch'.
UPDATE public.sources
SET source_role = 'trade_press',
    tier = 5,
    category = 'research',
    updated_at = now()
WHERE name ILIKE '%reuters sustainable%'
  AND name NOT ILIKE '%switch%'
  AND (source_role IS DISTINCT FROM 'trade_press'
       OR tier IS DISTINCT FROM 5
       OR category IS DISTINCT FROM 'research');

-- ============================================================================
-- 2. INSERT missing rows: the 2 analytical-press sources absent from the
--    live DB per pre-flight A1 (Edie and Environmental Finance).
--    Uses NOT EXISTS guards for idempotency. Mirrors tier into
--    tier_at_creation per the NOT NULL contract from migration 004.
-- ============================================================================

INSERT INTO public.sources (
  name, url, description,
  tier, tier_at_creation,
  source_role, category,
  intelligence_types, domains, jurisdictions, transport_modes,
  access_method, status,
  update_frequency,
  admin_only, paywalled, auto_run_enabled
)
SELECT
  'Edie',
  'https://www.edie.net/',
  'UK-headquartered sustainability and ESG news, analysis, and editorial commentary for business sustainability practitioners. Analytical press with named editorial provenance per platform-intent skill Section 3 (Research surface).',
  6, 6,
  'trade_press', 'research',
  ARRAY['regulatory','market_signal','research_finding']::text[],
  ARRAY[1,2,4,7]::integer[],
  ARRAY['uk','eu','global']::text[],
  ARRAY[]::text[],
  'manual', 'active',
  'weekly',
  false, false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.sources WHERE name ILIKE '%edie%'
);

INSERT INTO public.sources (
  name, url, description,
  tier, tier_at_creation,
  source_role, category,
  intelligence_types, domains, jurisdictions, transport_modes,
  access_method, status,
  update_frequency,
  admin_only, paywalled, auto_run_enabled
)
SELECT
  'Environmental Finance',
  'https://www.environmental-finance.com/',
  'Specialist analytical press covering sustainable finance, carbon markets, green bonds, and environmental commodities. Analytical horizon-scan content with named editorial provenance per platform-intent skill Section 3 (Research surface).',
  6, 6,
  'trade_press', 'research',
  ARRAY['market_signal','research_finding']::text[],
  ARRAY[2,4,7]::integer[],
  ARRAY['uk','eu','global']::text[],
  ARRAY[]::text[],
  'manual', 'active',
  'weekly',
  false, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.sources WHERE name ILIKE '%environmental finance%'
);

COMMIT;
