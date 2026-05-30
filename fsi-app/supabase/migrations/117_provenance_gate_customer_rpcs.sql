-- Migration 117: provenance-gate the RPC-routed customer surfaces
-- (Sprint 4 Block 1, task 1.10 — full-gate half).
--
-- Adds `AND ii.provenance_status = 'verified'` to the two query points that
-- feed every RPC-routed customer surface:
--   - _workspace_active_items(p_org_id) — the workspace-scoped data plane used
--     by get_research_items, get_operations_items, get_workspace_intelligence_
--     dashboard, get_workspace_intelligence_listings, and the two aggregates
--     RPCs. Gating here gates all six customer surfaces in one place.
--   - get_market_intel_items(p_org_id) — reads intelligence_items directly
--     (does NOT route through the helper), so it carries its own filter.
--
-- These six + market are ALL customer surfaces (verified live via
-- pg_proc reference scan, 2026-05-29). No admin function routes through the
-- helper, so admin reviewers keep seeing unverified / quarantined items.
--
-- ADDITIVE per the Block 1 hard fence: CREATE OR REPLACE FUNCTION changes what
-- the function RETURNS (adds a WHERE predicate); it touches NO row data and
-- flips NO item's provenance_status. The bodies below are reproduced VERBATIM
-- from the live definitions (pg_get_functiondef, 2026-05-29) so nothing else
-- drifts; the only change is the single provenance predicate, marked inline.
--
-- Pre-reconciliation: every existing row is still 'unverified', so all gated
-- customer surfaces return 0 rows on apply — the designed pre-launch state.

BEGIN;

-- ── _workspace_active_items: gate the workspace-scoped customer data plane ──
CREATE OR REPLACE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, archive_reason text, archive_note text, archived_date date, replaced_by uuid, version_history jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, linked_forum_thread_ids uuid[], linked_vendor_ids uuid[], linked_case_study_ids uuid[], linked_regulation_ids uuid[], region_tags text[], topic_tags text[], vertical_tags text[], full_brief text, urgency_tier text, format_type text, last_regenerated_at timestamp with time zone, regeneration_skill_version text, sources_used uuid[], operational_scenario_tags text[], compliance_object_tags text[], related_items uuid[], intersection_summary text, jurisdiction_iso text[], agent_integrity_flag boolean, agent_integrity_phrase text, agent_integrity_flagged_at timestamp with time zone, agent_integrity_resolved_at timestamp with time zone, agent_integrity_resolved_by uuid, pipeline_stage text, hidden_reason text, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
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
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified';   -- Sprint 4 task 1.10: customer read gate (ADDED)
END;
$function$;

-- ── get_market_intel_items: reads the base table directly; gate it here ──
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean)
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
    ii.signal_band,
    ii.trajectory_points,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    ii.what_it_changes,
    ii.conversion_trigger,
    ii.cross_references,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'   -- Sprint 4 task 1.10: customer read gate (ADDED)
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
    ii.added_date DESC;
$function$;

COMMIT;
