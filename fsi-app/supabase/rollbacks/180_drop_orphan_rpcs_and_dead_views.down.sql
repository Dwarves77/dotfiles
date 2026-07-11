-- Rollback for migration 180 — recreates the 2 orphan RPCs + 5 views from their live definitions
-- captured 2026-07-11 (project kwrsbpiseruzbfwjpvsp). Apply only to undo migration 180.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_workspace_members(p_org_id uuid)
 RETURNS TABLE(membership_id uuid, user_id uuid, role text, joined_at timestamp with time zone, full_name text, avatar_url text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.related_items_derived(p_item uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x.target_item_id), ARRAY[]::uuid[])
    FROM public.item_cross_references x
   WHERE x.source_item_id = p_item;
$function$;

CREATE VIEW public.open_conflicts WITH (security_invoker=true) AS
 SELECT c.id, c.item_id, c.source_a_id, c.source_b_id, c.source_a_tier, c.source_b_tier,
    c.source_a_claim, c.source_b_claim, c.field_in_dispute, c.status, c.resolution,
    c.resolution_note, c.resolved_by_source_id, c.resolved_by_human, c.opened_at, c.resolved_at,
    sa.name AS source_a_name, sb.name AS source_b_name, i.title AS item_title
   FROM source_conflicts c
     JOIN sources sa ON c.source_a_id = sa.id
     JOIN sources sb ON c.source_b_id = sb.id
     JOIN intelligence_items i ON c.item_id = i.id
  WHERE c.status = 'open'::text
  ORDER BY c.opened_at DESC;

CREATE VIEW public.provisional_sources_review WITH (security_invoker=on) AS
 SELECT ps.id, ps.name, ps.url, ps.description, ps.domain, ps.discovered_via, ps.cited_by_source_id,
    ps.cited_by_source_tier, ps.citation_count, ps.independent_citers, ps.citing_source_ids,
    ps.highest_citing_tier, ps.provisional_tier, ps.recommended_tier, ps.accessibility_verified,
    ps.publishes_structured_content, ps.entity_identified, ps.status, ps.reviewer_notes,
    ps.promoted_to_source_id, ps.created_at, ps.reviewed_at,
    s.name AS cited_by_name, s.base_tier AS cited_by_tier_current
   FROM provisional_sources ps
     LEFT JOIN sources s ON ps.cited_by_source_id = s.id
  WHERE ps.status = ANY (ARRAY['pending_review'::text, 'needs_more_data'::text])
  ORDER BY ps.independent_citers DESC, ps.citation_count DESC;

CREATE VIEW public.source_health_summary WITH (security_invoker=on) AS
 SELECT s.base_tier, s.status, count(*) AS source_count, avg(s.trust_score_overall) AS avg_trust_score,
    sum(CASE WHEN s.status = 'active'::text THEN 1 ELSE 0 END) AS active_count,
    sum(CASE WHEN s.status = 'stale'::text THEN 1 ELSE 0 END) AS stale_count,
    sum(CASE WHEN s.status = 'inaccessible'::text THEN 1 ELSE 0 END) AS inaccessible_count,
    sum(CASE WHEN s.next_scheduled_check < now() THEN 1 ELSE 0 END) AS overdue_count
   FROM sources s
  GROUP BY s.base_tier, s.status
  ORDER BY s.base_tier, s.status;

CREATE VIEW public.active_intelligence_items WITH (security_invoker=on) AS
 SELECT id, legacy_id, title, summary, what_is_it, why_matters, key_data, operational_impact,
    open_questions, tags, domain, category, item_type, source_id, source_url, jurisdictions,
    transport_modes, verticals, status, severity, confidence, priority, reasoning, entry_into_force,
    compliance_deadline, next_review_date, added_date, last_verified, is_archived, archive_reason,
    archive_note, archived_date, replaced_by, version_history, created_at, updated_at,
    linked_forum_thread_ids, linked_vendor_ids, linked_case_study_ids, linked_regulation_ids,
    region_tags, topic_tags, vertical_tags, full_brief, urgency_tier, format_type, last_regenerated_at,
    regeneration_skill_version, sources_used, operational_scenario_tags, compliance_object_tags,
    related_items, intersection_summary, jurisdiction_iso, agent_integrity_flag, agent_integrity_phrase,
    agent_integrity_flagged_at, agent_integrity_resolved_at, agent_integrity_resolved_by, pipeline_stage,
    hidden_reason, instrument_type, instrument_identifier, signal_band, theme, trajectory_points,
    what_it_changes, does_not_resolve, conversion_trigger, cross_references, provenance_status,
    provenance_verified_at
   FROM intelligence_items
  WHERE provenance_status = 'verified'::provenance_status;

CREATE VIEW public.item_related_items_derived WITH (security_invoker=on) AS
 SELECT source_item_id AS item_id, array_agg(DISTINCT target_item_id) AS related_items
   FROM item_cross_references
  GROUP BY source_item_id;

COMMIT;
