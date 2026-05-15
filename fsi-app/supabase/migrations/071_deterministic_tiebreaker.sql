-- Migration 071: deterministic tiebreaker on LIMIT-bounded RPCs.
--
-- Context
-- -------
-- The 5 workspace row-set RPCs introduced/updated in migrations 064, 066, 070
-- all ORDER BY effective_priority CASE, then added_date DESC, with no
-- tiebreaker. The dashboard RPC adds LIMIT 50 on top.
--
-- Empirically (operator org a0000000-...-0001, 2026-05-12):
--   * Active items: 643. CRITICAL items: 52. Three of those share
--     added_date = 2026-02-28.
--   * The dashboard's LIMIT 50 cuts off mid-CRITICAL — the planner is free
--     to return any 50 of the 52 CRITICAL rows, and which row gets dropped
--     depends on physical row order / index scan direction / planner state.
--   * The refactor in migration 073 (shared-scope SQL function) exercised
--     this directly: strict-equality verification caught a 1-row swap
--     pre/post even though the visible rendered list was functionally
--     identical. That swap is the symptom of nondeterminism, not the
--     symptom of a content bug. This migration fixes the underlying
--     nondeterminism so future refactors can verify byte-for-byte.
--
-- Why id ASC and not (created_at, id ASC)
-- ---------------------------------------
-- Investigated (scripts/tmp/071-investigate.mjs) against live DB:
--   * 110 active rows share an exact (added_date, created_at) tuple.
--   * created_at provides no additional discriminating power over added_date
--     for the rows that matter. The only column with universal uniqueness
--     is id (primary key).
-- Therefore the tiebreaker is `, id ASC` directly. This is a minimal,
-- maximally-discriminating, free-cost append.
--
-- Scope
-- -----
-- Five row-set RPCs:
--   - get_workspace_intelligence_dashboard  (064, LIMIT 50)
--   - get_workspace_intelligence_listings   (066, no LIMIT but partial order
--     still nondeterministic for consumers iterating)
--   - get_market_intel_items                (070)
--   - get_research_items                    (070)
--   - get_operations_items                  (070)
--
-- The two aggregate RPCs (068 get_workspace_intelligence_aggregates,
-- 069 get_workspace_intelligence_aggregates_scoped) have no ORDER BY and
-- return jsonb objects — they are out of scope for tiebreaker.
--
-- Each function below is reproduced verbatim from the live DB (dumped via
-- pg_get_functiondef on 2026-05-12, sha256 4d9b78… of 071-live-defs.json),
-- with `, id ASC` appended to the trailing ORDER BY clause. Everything
-- else — return shape, WHERE clauses, JOINs, security definer, language —
-- is identical to the live function.

-- ───────────────────────────────────────────────────────────────────────
-- 1. get_workspace_intelligence_dashboard
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_dashboard(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC
  LIMIT 50;
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 2. get_workspace_intelligence_listings
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 3. get_market_intel_items
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND s.source_role IN (
      'trade_press',
      'industry_data_provider',
      'vendor_corporate',
      'industry_association'
    )
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 4. get_research_items
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND (
      s.source_role IN ('intergovernmental_body', 'academic_research')
      OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
      OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
    )
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. get_operations_items
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND s.source_role = 'statistical_data_agency'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
$function$;
