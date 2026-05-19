-- Migration 084: Canonical category column on sources; refine 3 category-routing RPCs.
--
-- RESOLVES D6 technical debt from Sprint 2 plan (docs/sprint-2/sprint-2-planning-2026-05-18.md):
-- Build 4 (commit bd42cd4) wired category routing via Path 2 (src-side TypeScript
-- exception lists) for speed. This migration ports the mapping into a canonical
-- sources.category column so Build 7 (Market Intel signal aggregation) and future
-- source additions become DATA entries rather than CODE changes.
--
-- Caro's Ledge platform model (caros-ledge-platform-intent SKILL.md Section 3 +
-- environmental-policy-and-innovation source taxonomy): four customer-facing
-- intelligence pages map to four canonical source categories:
--   regulatory       -> Regulations (binding regulatory intelligence)
--   research         -> Research (horizon-scan analytical content)
--   market_news      -> Market Intel (industry signals + commercial research)
--   operational_data -> Operations (jurisdictional decision intelligence)
--
-- Backfill mirrors Path 2 logic exactly (does NOT change the mapping; ports it):
--   1. Name-based exceptions (apply first; precedence over role default):
--      - IMO, ICAO              -> regulatory (override 'intergovernmental_body' default)
--      - 8-name trade press list -> research  (override 'trade_press' default)
--      - Carbon Trust, Project Drawdown -> research (override 'statistical_data_agency' default)
--   2. Role-based defaults:
--      - primary_legal_authority, standards_body, government_press -> regulatory
--      - intergovernmental_body, academic_research                  -> research
--      - trade_press, industry_data_provider, vendor_corporate,
--        industry_association                                       -> market_news
--      - statistical_data_agency                                    -> operational_data
--      - NULL or unrecognized role                                  -> NULL (unrouted)
--
-- Item-level status conditionals (preserved in get_research_items RPC body, NOT
-- captured in sources.category):
--   - standards_body items with status NOT IN ('in_force', 'adopted') -> Research
--   - primary_legal_authority items with status = 'proposed'          -> Research
-- These are per-item state overrides that route specific items to Research even
-- when their source's default category is regulatory. The RPC body handles them.

BEGIN;

-- 1. Add column (NULLABLE; the 39 NULL-role sources stay NULL).
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Backfill via CASE matching Path 2 + RPC role filter union.
UPDATE public.sources
SET category = CASE
  -- Name-based exceptions (apply first; precedence over role default)
  WHEN LOWER(name) LIKE '%imo%' OR LOWER(name) LIKE '%icao%' THEN 'regulatory'
  WHEN LOWER(name) LIKE '%freightwaves%'
    OR LOWER(name) LIKE '%loadstar%'
    OR LOWER(name) LIKE '%greenbiz%'
    OR LOWER(name) LIKE '%environmental finance%'
    OR LOWER(name) LIKE '%splash247%'
    OR LOWER(name) LIKE '%supply chain digital%'
    OR LOWER(name) LIKE '%edie%'
    OR LOWER(name) LIKE '%reuters sustainable business%'
    OR LOWER(name) LIKE '%carbon trust%'
    OR LOWER(name) LIKE '%project drawdown%'
    THEN 'research'
  -- Role-based defaults
  WHEN source_role IN ('primary_legal_authority', 'standards_body', 'government_press') THEN 'regulatory'
  WHEN source_role IN ('intergovernmental_body', 'academic_research') THEN 'research'
  WHEN source_role IN ('trade_press', 'industry_data_provider', 'vendor_corporate', 'industry_association') THEN 'market_news'
  WHEN source_role = 'statistical_data_agency' THEN 'operational_data'
  ELSE NULL
END
WHERE category IS NULL;

-- 3. Add CHECK constraint (allows NULL for the 39 unrouted sources;
--    enforces the four canonical values for everything else).
ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_category_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_category_check
  CHECK (category IS NULL OR category IN ('regulatory', 'research', 'market_news', 'operational_data'));

-- 4. Index for routing-RPC lookups (small table; small index).
CREATE INDEX IF NOT EXISTS idx_sources_category ON public.sources (category) WHERE category IS NOT NULL;

-- 5. Column comment for documentation
COMMENT ON COLUMN public.sources.category IS
  'Canonical four-category taxonomy per caros-ledge-platform-intent SKILL.md Section 3 + environmental-policy-and-innovation source taxonomy. Values: regulatory, research, market_news, operational_data, or NULL (unrouted). Drives /regulations, /research, /market, /operations category routing via get_*_items RPCs. NULL sources are not surfaced on the four category pages (they may still appear via unfiltered fetchers). Item-level status conditionals (standards_body items NOT in_force/adopted, primary_legal_authority items proposed) override category routing in get_research_items RPC.';

-- 6. Refine get_market_intel_items to use sources.category.
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE s.category = 'market_news'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
END;
$function$;

-- 7. Refine get_research_items. Uses sources.category for the default route
--    PLUS preserves the item-level status conditionals from the original 070/073
--    that override category routing for specific draft-state items.
CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE
    -- Primary category route (covers academic_research, intergovernmental_body
    -- except IMO/ICAO, name-excepted trade_press, name-excepted statistical_data_agency)
    s.category = 'research'
    -- Item-level status conditional overrides (preserved from original RPC body)
    OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
    OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
END;
$function$;

-- 8. Refine get_operations_items to use sources.category.
CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE s.category = 'operational_data'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
END;
$function$;

COMMIT;
