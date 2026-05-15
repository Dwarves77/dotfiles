-- Migration 077 — Membership-scoped data access (Workstream C)
--
-- Date: 2026-05-15
-- Workstream: Multi-Tenant Foundation C (RPC hardening + group-scoped pools)
-- Pre-work: docs/multi-tenant-foundation-prework-2026-05-15.md
--
-- Background
-- ----------
-- The product audit S11 names this exactly: "the seven page RPCs are
-- SECURITY DEFINER and accept any p_org_id without checking auth.uid()
-- membership in the org, which is a soft confidentiality leak waiting
-- for a second tenant to exist." This migration closes that hole and
-- adds the helper / pool tables that workspace-internal features need.
--
-- Live introspection (2026-05-15) found TEN such DEFINER RPCs taking
-- p_org_id, not seven:
--   1. _workspace_active_items(p_org_id)            -- shared scope (PR #113)
--   2. get_workspace_intelligence(p_org_id)         -- dashboard fat
--   3. get_workspace_intelligence_dashboard(p_org_id) -- 064
--   4. get_workspace_intelligence_listings(p_org_id)  -- 066
--   5. get_workspace_intelligence_slim(p_org_id)      -- 047
--   6. get_workspace_intelligence_aggregates(p_org_id) -- 068
--   7. get_workspace_intelligence_aggregates_scoped(p_org_id, p_scope_filter) -- 069
--   8. get_market_intel_items(p_org_id)             -- 070 / PR #100
--   9. get_research_items(p_org_id)                 -- 070 / PR #100
--  10. get_operations_items(p_org_id)               -- 070 / PR #100
--
-- Defense in depth: the check goes into every one of these, NOT only
-- _workspace_active_items, because two of them (get_workspace_intelligence
-- and get_workspace_intelligence_slim) don't go through that scope
-- function -- they query intelligence_items + workspace_item_overrides
-- directly with the same JOIN inlined.
--
-- LANGUAGE constraint: the existing functions are LANGUAGE sql which
-- does not support conditional RAISE EXCEPTION. The check is added by
-- wrapping the SQL in a plpgsql function body. Function signature
-- (RETURNS TABLE / RETURNS jsonb) and STABLE / SECURITY DEFINER
-- modifiers are preserved. The PostgREST-facing contract is unchanged.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Helper assertion function (avoids 10x RAISE EXCEPTION boilerplate)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_org_membership(p_org_id uuid)
RETURNS void AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required' USING ERRCODE = '22023';
  END IF;
  -- Service role bypasses (admin-side server processes call these RPCs
  -- against any org_id; the membership check is for end-user paths).
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of org %', p_org_id USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public._assert_org_membership(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public._assert_org_membership(uuid) IS
  'Workspace authorization gate. RAISE EXCEPTION if auth.uid() is not a member of p_org_id. Service role bypasses. Called by every page-data RPC and by org_watchlist policies.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. Convert the 10 RPCs to add the membership check
-- ───────────────────────────────────────────────────────────────────────
-- Pattern: drop the SQL function, recreate as plpgsql (RETURN QUERY for
-- TABLE-returning, RETURN for scalar-returning). Body is unchanged.

-- 2.1 _workspace_active_items
DROP FUNCTION IF EXISTS public._workspace_active_items(uuid);
CREATE OR REPLACE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid,
   legacy_id text,
   title text,
   summary text,
   what_is_it text,
   why_matters text,
   key_data text[],
   operational_impact text,
   open_questions text[],
   tags text[],
   domain integer,
   category text,
   item_type text,
   source_id uuid,
   source_url text,
   jurisdictions text[],
   transport_modes text[],
   verticals text[],
   status text,
   severity text,
   confidence text,
   priority text,
   reasoning text,
   entry_into_force date,
   compliance_deadline date,
   next_review_date date,
   added_date date,
   last_verified timestamp with time zone,
   is_archived boolean,
   archive_reason text,
   archive_note text,
   archived_date date,
   replaced_by uuid,
   version_history jsonb,
   created_at timestamp with time zone,
   updated_at timestamp with time zone,
   linked_forum_thread_ids uuid[],
   linked_vendor_ids uuid[],
   linked_case_study_ids uuid[],
   linked_regulation_ids uuid[],
   region_tags text[],
   topic_tags text[],
   vertical_tags text[],
   full_brief text,
   urgency_tier text,
   format_type text,
   last_regenerated_at timestamp with time zone,
   regeneration_skill_version text,
   sources_used uuid[],
   operational_scenario_tags text[],
   compliance_object_tags text[],
   related_items uuid[],
   intersection_summary text,
   jurisdiction_iso text[],
   agent_integrity_flag boolean,
   agent_integrity_phrase text,
   agent_integrity_flagged_at timestamp with time zone,
   agent_integrity_resolved_at timestamp with time zone,
   agent_integrity_resolved_by uuid,
   pipeline_stage text,
   hidden_reason text,
   effective_priority text,
   effective_archived boolean
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.operational_impact, ii.open_questions, ii.tags, ii.domain,
    ii.category, ii.item_type, ii.source_id, ii.source_url, ii.jurisdictions,
    ii.transport_modes, ii.verticals, ii.status, ii.severity, ii.confidence,
    ii.priority, ii.reasoning, ii.entry_into_force, ii.compliance_deadline,
    ii.next_review_date, ii.added_date, ii.last_verified, ii.is_archived,
    ii.archive_reason, ii.archive_note, ii.archived_date, ii.replaced_by,
    ii.version_history, ii.created_at, ii.updated_at,
    ii.linked_forum_thread_ids, ii.linked_vendor_ids, ii.linked_case_study_ids,
    ii.linked_regulation_ids, ii.region_tags, ii.topic_tags, ii.vertical_tags,
    ii.full_brief, ii.urgency_tier, ii.format_type, ii.last_regenerated_at,
    ii.regeneration_skill_version, ii.sources_used,
    ii.operational_scenario_tags, ii.compliance_object_tags,
    ii.related_items, ii.intersection_summary, ii.jurisdiction_iso,
    ii.agent_integrity_flag, ii.agent_integrity_phrase,
    ii.agent_integrity_flagged_at, ii.agent_integrity_resolved_at,
    ii.agent_integrity_resolved_by, ii.pipeline_stage, ii.hidden_reason,
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public._workspace_active_items(uuid) TO authenticated, service_role;

-- 2.2 get_workspace_intelligence
DROP FUNCTION IF EXISTS public.get_workspace_intelligence(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], full_brief text, operational_impact text,
   open_questions text[], tags text[], domain integer, category text,
   item_type text, source_id uuid, source_url text, jurisdictions text[],
   transport_modes text[], verticals text[], status text, severity text,
   confidence text, priority text, reasoning text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.full_brief, ii.operational_impact, ii.open_questions,
    ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id, ii.source_url,
    ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status, ii.severity,
    ii.confidence, ii.priority, ii.reasoning, ii.entry_into_force,
    ii.compliance_deadline, ii.next_review_date, ii.added_date, ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
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
    ii.added_date DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence(uuid) TO authenticated, service_role;

-- 2.3 get_workspace_intelligence_dashboard
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_dashboard(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_dashboard(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.tags, ii.domain,
    ii.category, ii.item_type, ii.source_id, ii.source_url,
    ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.confidence, ii.priority, ii.entry_into_force,
    ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_dashboard(uuid) TO authenticated, service_role;

-- 2.4 get_workspace_intelligence_listings
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_listings(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, what_is_it text, why_matters text,
   key_data text[], tags text[], domain integer, category text, item_type text,
   source_id uuid, source_url text, jurisdictions text[], transport_modes text[],
   verticals text[], status text, severity text, confidence text, priority text,
   entry_into_force date, compliance_deadline date, next_review_date date,
   added_date date, last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_listings(uuid) TO authenticated, service_role;

-- 2.5 get_workspace_intelligence_slim
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_slim(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
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
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
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
    ii.added_date DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_slim(uuid) TO authenticated, service_role;

-- 2.6 get_workspace_intelligence_aggregates
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_aggregates(uuid);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_aggregates(p_org_id uuid)
RETURNS jsonb AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN (
    WITH scope AS (
      SELECT
        ii.id, ii.status, ii.jurisdictions, ii.updated_at, ii.effective_priority
      FROM public._workspace_active_items(p_org_id) ii
    ),
    by_priority AS (
      SELECT effective_priority AS k, COUNT(*)::int AS v FROM scope GROUP BY effective_priority
    ),
    by_status AS (
      SELECT status AS k, COUNT(*)::int AS v FROM scope GROUP BY status
    ),
    juris_unnest AS (
      SELECT NULLIF(TRIM(j), '') AS jurisdiction
      FROM scope
      LEFT JOIN LATERAL unnest(scope.jurisdictions) AS j ON TRUE
    ),
    by_jurisdiction AS (
      SELECT jurisdiction AS k, COUNT(*)::int AS v
      FROM juris_unnest WHERE jurisdiction IS NOT NULL GROUP BY jurisdiction
    ),
    totals AS (
      SELECT
        (SELECT COUNT(*)::int FROM scope) AS total_items,
        (SELECT COUNT(DISTINCT jurisdiction)::int FROM juris_unnest WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
        (SELECT MAX(updated_at) FROM scope) AS last_updated_at
    )
    SELECT jsonb_build_object(
      'total_items',         (SELECT total_items FROM totals),
      'by_priority',         COALESCE((SELECT jsonb_object_agg(k, v) FROM by_priority), '{}'::jsonb),
      'by_status',           COALESCE((SELECT jsonb_object_agg(k, v) FROM by_status), '{}'::jsonb),
      'by_jurisdiction',     COALESCE((SELECT jsonb_object_agg(k, v) FROM by_jurisdiction), '{}'::jsonb),
      'total_jurisdictions', (SELECT total_jurisdictions FROM totals),
      'last_updated_at',     (SELECT last_updated_at FROM totals)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_aggregates(uuid) TO authenticated, service_role;

-- 2.7 get_workspace_intelligence_aggregates_scoped
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_aggregates_scoped(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_aggregates_scoped(
  p_org_id uuid,
  p_scope_filter jsonb DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN (
    WITH scope AS (
      SELECT
        ii.id, ii.status, ii.jurisdictions, ii.updated_at,
        ii.item_type, ii.domain, ii.effective_priority
      FROM public._workspace_active_items(p_org_id) ii
    ),
    filtered AS (
      SELECT *
      FROM scope
      WHERE
        p_scope_filter IS NULL
        OR (
          (p_scope_filter ? 'item_types' OR p_scope_filter ? 'domains')
          AND (
            (p_scope_filter ? 'item_types'
             AND scope.item_type = ANY(
               SELECT jsonb_array_elements_text(p_scope_filter -> 'item_types')
             ))
            OR
            (p_scope_filter ? 'domains'
             AND scope.domain = ANY(
               SELECT (jsonb_array_elements_text(p_scope_filter -> 'domains'))::int
             ))
          )
        )
        OR (
          NOT (p_scope_filter ? 'item_types')
          AND NOT (p_scope_filter ? 'domains')
        )
    ),
    by_priority AS (
      SELECT effective_priority AS k, COUNT(*)::int AS v FROM filtered GROUP BY effective_priority
    ),
    by_status AS (
      SELECT status AS k, COUNT(*)::int AS v FROM filtered GROUP BY status
    ),
    juris_unnest AS (
      SELECT NULLIF(TRIM(j), '') AS jurisdiction
      FROM filtered
      LEFT JOIN LATERAL unnest(filtered.jurisdictions) AS j ON TRUE
    ),
    by_jurisdiction AS (
      SELECT jurisdiction AS k, COUNT(*)::int AS v
      FROM juris_unnest WHERE jurisdiction IS NOT NULL GROUP BY jurisdiction
    ),
    totals AS (
      SELECT
        (SELECT COUNT(*)::int FROM filtered) AS total_items,
        (SELECT COUNT(DISTINCT jurisdiction)::int FROM juris_unnest WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
        (SELECT MAX(updated_at) FROM filtered) AS last_updated_at
    )
    SELECT jsonb_build_object(
      'total_items',         (SELECT total_items FROM totals),
      'by_priority',         COALESCE((SELECT jsonb_object_agg(k, v) FROM by_priority), '{}'::jsonb),
      'by_status',           COALESCE((SELECT jsonb_object_agg(k, v) FROM by_status), '{}'::jsonb),
      'by_jurisdiction',     COALESCE((SELECT jsonb_object_agg(k, v) FROM by_jurisdiction), '{}'::jsonb),
      'total_jurisdictions', (SELECT total_jurisdictions FROM totals),
      'last_updated_at',     (SELECT last_updated_at FROM totals)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_aggregates_scoped(uuid, jsonb) TO authenticated, service_role;

-- 2.8 get_market_intel_items
DROP FUNCTION IF EXISTS public.get_market_intel_items(uuid);
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
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
  WHERE s.source_role IN (
      'trade_press',
      'industry_data_provider',
      'vendor_corporate',
      'industry_association'
    )
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_market_intel_items(uuid) TO authenticated, service_role;

-- 2.9 get_research_items
DROP FUNCTION IF EXISTS public.get_research_items(uuid);
CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
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
  WHERE (
      s.source_role IN ('intergovernmental_body', 'academic_research')
      OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
      OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
    )
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_research_items(uuid) TO authenticated, service_role;

-- 2.10 get_operations_items
DROP FUNCTION IF EXISTS public.get_operations_items(uuid);
CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean
 ) AS $$
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
  WHERE s.source_role = 'statistical_data_agency'
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_operations_items(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Helper RPC: get_workspace_members(p_org_id)
-- ───────────────────────────────────────────────────────────────────────
-- Per dispatch brief: "Helper SQL function: get_workspace_members(p_org_id)
-- RETURNS TABLE wrapping org_memberships -> profiles join."
-- Used by assign-to pickers, mention autocomplete, member rolls.

CREATE OR REPLACE FUNCTION public.get_workspace_members(p_org_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  full_name text,
  avatar_url text,
  email text
) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    m.id          AS membership_id,
    m.user_id,
    m.role,
    m.created_at  AS joined_at,
    p.full_name,
    p.avatar_url,
    u.email
  FROM public.org_memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN auth.users u      ON u.id = m.user_id
  WHERE m.org_id = p_org_id
  ORDER BY
    CASE m.role
      WHEN 'owner'  THEN 1
      WHEN 'admin'  THEN 2
      WHEN 'member' THEN 3
      WHEN 'viewer' THEN 4
      ELSE 5
    END,
    p.full_name NULLS LAST,
    u.email NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_members(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_workspace_members(uuid) IS
  'List members of a workspace. Member-only access (enforced via _assert_org_membership). Returns profile join + auth.users.email. Used by assign-to pickers and mention autocomplete.';

-- ───────────────────────────────────────────────────────────────────────
-- 4. org_watchlist (group-shared watchlist; complements personal user_watchlist)
-- ───────────────────────────────────────────────────────────────────────
-- Per dispatch decision I.1: Bloomberg pattern. Personal vs team-shared.
-- user_watchlist (existing, migration 060): visible to owner only.
-- org_watchlist (new): visible to all members of an org.

CREATE TABLE IF NOT EXISTS public.org_watchlist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  item_type    text NOT NULL,
  item_id      text NOT NULL,
  note         text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_org_watchlist_org_created
  ON public.org_watchlist (org_id, created_at DESC);

COMMENT ON TABLE public.org_watchlist IS
  'Team-shared watchlist (visible to all org members). Complements user_watchlist (personal). Migration 077 / Workstream C.';

ALTER TABLE public.org_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_watchlist_member_read ON public.org_watchlist;
CREATE POLICY org_watchlist_member_read
  ON public.org_watchlist
  FOR SELECT
  USING (
    public.user_belongs_to_org(org_id) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS org_watchlist_member_insert ON public.org_watchlist;
CREATE POLICY org_watchlist_member_insert
  ON public.org_watchlist
  FOR INSERT
  WITH CHECK (
    (
      public.user_belongs_to_org(org_id)
      AND added_by_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS org_watchlist_member_delete ON public.org_watchlist;
CREATE POLICY org_watchlist_member_delete
  ON public.org_watchlist
  FOR DELETE
  USING (
    public.user_belongs_to_org(org_id) OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS org_watchlist_member_update ON public.org_watchlist;
CREATE POLICY org_watchlist_member_update
  ON public.org_watchlist
  FOR UPDATE
  USING (
    public.user_belongs_to_org(org_id) OR auth.role() = 'service_role'
  );

-- ───────────────────────────────────────────────────────────────────────
-- 5. workspace_item_overrides RLS already member-scoped (verified live)
-- ───────────────────────────────────────────────────────────────────────
-- Pre-work introspection confirmed the four existing policies on
-- workspace_item_overrides already use user_belongs_to_org(org_id). No
-- tightening needed at this layer; the RPC layer is where the leak was.

COMMIT;

-- ───────────────────────────────────────────────────────────────────────
-- Verification (manual; run separately)
-- ───────────────────────────────────────────────────────────────────────
-- 1) Membership-positive: as the Jason auth user against Dietl/Rockit
--    SELECT count(*) FROM public.get_workspace_intelligence_dashboard('a0000000-0000-0000-0000-000000000001');
--    Expected: > 0 rows
-- 2) Membership-negative: as the Jason auth user against a fake org
--    SELECT count(*) FROM public.get_workspace_intelligence_dashboard('00000000-0000-0000-0000-000000000999');
--    Expected: ERROR 42501 'Not a member of org ...'
-- 3) Service role positive: same fake org via service-role client
--    Expected: 0 rows (no items belong to that org), no exception (service role bypasses)
-- 4) get_workspace_members:
--    SELECT * FROM public.get_workspace_members('a0000000-0000-0000-0000-000000000001');
--    Expected: 1 row (Jason, owner, with full_name + email).
