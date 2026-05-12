-- Migration 073: extract shared workspace-scope SQL function.
--
-- Numbered 073 because 072 is occupied by jurisdiction_normalizer
-- (PR #101, separate workstream).
--
-- Background
-- ----------
-- Migrations 064, 066, 068, 069, 070 each duplicated the same join +
-- override resolution + active-row filter:
--
--   FROM intelligence_items ii
--   LEFT JOIN workspace_item_overrides wo
--     ON  wo.item_id = ii.id
--     AND wo.org_id  = p_org_id
--   WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
--
-- with two computed columns repeated verbatim:
--
--   COALESCE(wo.priority_override, ii.priority) AS effective_priority
--   COALESCE(wo.is_archived,       ii.is_archived) AS effective_archived
--
-- Migration 068 left an explicit TODO acknowledging this duplication
-- ("Same active-row scope as 064/066").
--
-- This migration introduces `_workspace_active_items(p_org_id)`, a
-- SECURITY DEFINER STABLE SQL function that returns one row per active
-- (item × workspace-override) combo with the two computed columns folded
-- in. The seven dependent RPCs are then re-created to source from this
-- function rather than re-typing the JOIN.
--
-- Functional contract
-- -------------------
-- Each of the 7 RPCs keeps its existing RETURNS TABLE signature, ORDER BY
-- (including the `, id ASC` tiebreaker from migration 071), LIMIT,
-- additional WHERE clauses (e.g. market_intel/research/operations role
-- filters), and SECURITY DEFINER setting. The ONLY semantic change is
-- that the workspace-scope JOIN moves inside `_workspace_active_items`.
--
-- Verification
-- ------------
-- Strict-equality verification runs against the operator org
-- (a0000000-...-0001) pre-073 (post-071-tiebreaker baseline) vs post-073:
--   * Set-returning RPCs: id list equality (sorted)
--   * Aggregate RPCs: full jsonb equality
-- All 7 must match exactly. The deterministic ordering from 071 is what
-- makes this strict equality check meaningful.
--
-- Ground truth: scripts/tmp/073-live-defs.json dumped via pg_get_functiondef
-- on 2026-05-12 (post-071-applied). Live differs from disk for migrations
-- 067-070 (separate PRs not yet merged to master), so live is the source.

-- ───────────────────────────────────────────────────────────────────────
-- 0. Shared workspace scope function
-- ───────────────────────────────────────────────────────────────────────
-- Returns one row per active intelligence_item × workspace-override
-- resolution. Active = NOT effectively-archived (override beats item).
-- Surfaces `effective_priority` and `effective_archived` so callers can
-- ORDER BY priority and never need to recompute the COALESCE.
--
-- Return type lists EVERY intelligence_items column explicitly so
-- subsequent RPCs can project freely without composite-type DDL. Order
-- matches information_schema.columns ordinal_position (2026-05-12).

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
 )
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
    ii.operational_impact,
    ii.open_questions,
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
    ii.reasoning,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    ii.archive_reason,
    ii.archive_note,
    ii.archived_date,
    ii.replaced_by,
    ii.version_history,
    ii.created_at,
    ii.updated_at,
    ii.linked_forum_thread_ids,
    ii.linked_vendor_ids,
    ii.linked_case_study_ids,
    ii.linked_regulation_ids,
    ii.region_tags,
    ii.topic_tags,
    ii.vertical_tags,
    ii.full_brief,
    ii.urgency_tier,
    ii.format_type,
    ii.last_regenerated_at,
    ii.regeneration_skill_version,
    ii.sources_used,
    ii.operational_scenario_tags,
    ii.compliance_object_tags,
    ii.related_items,
    ii.intersection_summary,
    ii.jurisdiction_iso,
    ii.agent_integrity_flag,
    ii.agent_integrity_phrase,
    ii.agent_integrity_flagged_at,
    ii.agent_integrity_resolved_at,
    ii.agent_integrity_resolved_by,
    ii.pipeline_stage,
    ii.hidden_reason,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived);
$function$;

GRANT EXECUTE ON FUNCTION public._workspace_active_items(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 1. get_workspace_intelligence_dashboard (was 064; tiebreaker 071)
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
    ii.effective_priority,
    ii.effective_archived
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
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 2. get_workspace_intelligence_listings (was 066; tiebreaker 071)
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
    ii.effective_priority,
    ii.effective_archived
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
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 3. get_workspace_intelligence_aggregates (was 068)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_aggregates(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH scope AS (
    SELECT
      ii.id,
      ii.status,
      ii.jurisdictions,
      ii.updated_at,
      ii.effective_priority
    FROM public._workspace_active_items(p_org_id) ii
  ),
  by_priority AS (
    SELECT effective_priority AS k, COUNT(*)::int AS v
    FROM scope
    GROUP BY effective_priority
  ),
  by_status AS (
    SELECT status AS k, COUNT(*)::int AS v
    FROM scope
    GROUP BY status
  ),
  juris_unnest AS (
    SELECT NULLIF(TRIM(j), '') AS jurisdiction
    FROM scope
    LEFT JOIN LATERAL unnest(scope.jurisdictions) AS j ON TRUE
  ),
  by_jurisdiction AS (
    SELECT jurisdiction AS k, COUNT(*)::int AS v
    FROM juris_unnest
    WHERE jurisdiction IS NOT NULL
    GROUP BY jurisdiction
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM scope) AS total_items,
      (SELECT COUNT(DISTINCT jurisdiction)::int
         FROM juris_unnest
         WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
      (SELECT MAX(updated_at) FROM scope) AS last_updated_at
  )
  SELECT jsonb_build_object(
    'total_items',         (SELECT total_items FROM totals),
    'by_priority',         COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_priority),
                             '{}'::jsonb
                           ),
    'by_status',           COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_status),
                             '{}'::jsonb
                           ),
    'by_jurisdiction',     COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_jurisdiction),
                             '{}'::jsonb
                           ),
    'total_jurisdictions', (SELECT total_jurisdictions FROM totals),
    'last_updated_at',     (SELECT last_updated_at FROM totals)
  );
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 4. get_workspace_intelligence_aggregates_scoped (was 069)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_aggregates_scoped(p_org_id uuid, p_scope_filter jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH scope AS (
    SELECT
      ii.id,
      ii.status,
      ii.jurisdictions,
      ii.updated_at,
      ii.item_type,
      ii.domain,
      ii.effective_priority
    FROM public._workspace_active_items(p_org_id) ii
  ),
  filtered AS (
    -- When p_scope_filter is NULL or has neither key, pass through.
    -- Otherwise an item matches if its item_type is in item_types[] OR
    -- its domain is in domains[] (OR semantics, mirroring page filters).
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
        -- Edge case: object passed but with no item_types or domains keys.
        -- Treat as no filter.
        NOT (p_scope_filter ? 'item_types')
        AND NOT (p_scope_filter ? 'domains')
      )
  ),
  by_priority AS (
    SELECT effective_priority AS k, COUNT(*)::int AS v
    FROM filtered
    GROUP BY effective_priority
  ),
  by_status AS (
    SELECT status AS k, COUNT(*)::int AS v
    FROM filtered
    GROUP BY status
  ),
  juris_unnest AS (
    SELECT NULLIF(TRIM(j), '') AS jurisdiction
    FROM filtered
    LEFT JOIN LATERAL unnest(filtered.jurisdictions) AS j ON TRUE
  ),
  by_jurisdiction AS (
    SELECT jurisdiction AS k, COUNT(*)::int AS v
    FROM juris_unnest
    WHERE jurisdiction IS NOT NULL
    GROUP BY jurisdiction
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM filtered) AS total_items,
      (SELECT COUNT(DISTINCT jurisdiction)::int
         FROM juris_unnest
         WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
      (SELECT MAX(updated_at) FROM filtered) AS last_updated_at
  )
  SELECT jsonb_build_object(
    'total_items',         (SELECT total_items FROM totals),
    'by_priority',         COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_priority),
                             '{}'::jsonb
                           ),
    'by_status',           COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_status),
                             '{}'::jsonb
                           ),
    'by_jurisdiction',     COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_jurisdiction),
                             '{}'::jsonb
                           ),
    'total_jurisdictions', (SELECT total_jurisdictions FROM totals),
    'last_updated_at',     (SELECT last_updated_at FROM totals)
  );
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. get_market_intel_items (was 070; tiebreaker 071)
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
    ii.effective_priority,
    ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN sources s ON s.id = ii.source_id
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
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 6. get_research_items (was 070; tiebreaker 071)
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
    ii.effective_priority,
    ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN sources s ON s.id = ii.source_id
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
$function$;

-- ───────────────────────────────────────────────────────────────────────
-- 7. get_operations_items (was 070; tiebreaker 071)
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
    ii.effective_priority,
    ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN sources s ON s.id = ii.source_id
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
$function$;
