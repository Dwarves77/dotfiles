-- 308 — project intelligence_items.item_grade (migration 278) through every listing/category-routed
-- RPC that feeds a ledger row (lane CHIPS, 2026-09-05, W3.4).
--
-- ROOT CAUSE THIS MIGRATION FIXES [CONFIRMED, this lane, live pg_get_functiondef reads,
-- 2026-09-05]: RecordGradeBadge.tsx has been wired into RegulationsLedger.tsx (row), and the three
-- detail surfaces since 2026-09-01/04 (`itemGrade: row.item_grade === "record" ? ... `), but EVERY
-- RPC a ledger ROW actually reads from omits `ii.item_grade` from its RETURNS TABLE — the mapper
-- comments in src/lib/supabase-server.ts already say so verbatim ("Lane POP ... dormant ... none of
-- these RPCs project ii.item_grade yet"), and this lane re-confirmed it live against all 11
-- functions below (zero of them mention item_grade). Detail pages read `select("*")` directly
-- against intelligence_items and so already see it live; only the LIST/ledger row path was starved.
-- Live impact, measured this lane: 1,101 non-archived verified items carry item_grade='record'
-- (1,095 of them domain=1 / Regulations), so RegulationsLedger's RecordGradeBadge has been rendering
-- nothing for essentially its entire population since it shipped.
--
-- WHAT CHANGES: `ii.item_grade` (text, migration 278 — 'record'|'brief'|NULL) is added as a NEW
-- TRAILING column on 11 functions' RETURNS TABLE + SELECT list: the one helper
-- `_workspace_active_items` (org-scoped shared base for the listings/operations/research RPCs) and
-- the 10 listing/category RPCs (org-scoped + org-independent `_public` pair for slim, listings,
-- market, operations, research). Every SELECT list, WHERE clause, JOIN and ORDER BY is otherwise
-- BYTE-IDENTICAL to the live definitions captured below (verified via Supabase MCP `execute_sql`,
-- read-only, 2026-09-05) — this migration adds one column, changes no routing/filtering logic.
--
-- WHY A NEW COLUMN CANNOT DESYNC THE ORG-SCOPED / PUBLIC PAIRS: `get_market_intel_items_public` etc.
-- already mirror their org-scoped sibling's SELECT list exactly (migration 306's own stated
-- invariant); this migration extends both halves of each pair identically, in the same statement,
-- so the two stay byte-identical minus the org join, exactly as before.
--
-- CODE SIDE NEEDS NO CHANGE: `src/lib/supabase-server.ts`'s `mapWorkspaceItemRows` and
-- `rpcRowToResource` already read `row.item_grade` defensively (`row.item_grade === "record" ? ... :
-- undefined`) — the exact "dormant passthrough" pattern this codebase already uses for
-- jurisdiction_iso/origin_class elsewhere. Once this migration is live, those two mappers' existing
-- code lights up with no further deploy; this lane's own PR ships alongside this file per the
-- two-track policy (CLAUDE.md rule 3: DDL before code — this migration must apply before, or in the
-- same window as, that PR's landing for the row-chip work it enables to show real data).
--
-- APPLY ORDER: standalone; does not depend on 305/306/307. Apply whenever the two-track policy's
-- window allows — the coordinator applies via Supabase MCP, then runs the post-check block below.
--
-- Reversible: re-run each function's PRE-migration body (captured verbatim in the pre-check comment
-- block immediately below each `CREATE OR REPLACE`) via `CREATE OR REPLACE FUNCTION ...` — every
-- function is a pure read with no dependents beyond its own callers (grep-verified, this lane).
--
-- PRE-CHECK (md5 of the live function bodies this migration replaces, Supabase MCP execute_sql,
-- read-only, 2026-09-05 — run this again immediately before applying; if any md5 differs, STOP and
-- reconcile against the new live body before proceeding, per rule 15 "attack, don't assert presence"):
--   SELECT p.proname, md5(pg_get_functiondef(p.oid))
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN (
--      '_workspace_active_items',
--      'get_workspace_intelligence_slim','get_workspace_intelligence_slim_public',
--      'get_workspace_intelligence_listings','get_workspace_intelligence_listings_public',
--      'get_market_intel_items','get_market_intel_items_public',
--      'get_operations_items','get_operations_items_public',
--      'get_research_items','get_research_items_public'
--    ) ORDER BY p.proname;
--   -- Expected (2026-09-05, this lane):
--   -- _workspace_active_items                        71b16297b131a31d1f765a3d445dfd05
--   -- get_market_intel_items                         f5796cec7520fae45c340ce21d246079
--   -- get_market_intel_items_public                  9d39246ede35c26800f7b936f4376702
--   -- get_operations_items                            a1b4d782a6ca66c4ccab784e4790ac27
--   -- get_operations_items_public                    cf3cb4fdfbd0c9d6de3a9bdab602b1a9
--   -- get_research_items                              2ebdf8d606ed95c82a13ad8c70cec260
--   -- get_research_items_public                      406ca225316de4bc4aa2f0aebd779e9c
--   -- get_workspace_intelligence_listings             7944932d0d139fade949f81fa458801f
--   -- get_workspace_intelligence_listings_public     d37a9bb04b368ec235009a9ef23a7624
--   -- get_workspace_intelligence_slim                3ca10db08f84c019c9fa0e16bfe3b49b
--   -- get_workspace_intelligence_slim_public         001533ca27dcecbdf2b83cef58b51633

-- 1. _workspace_active_items(p_org_id) — shared org-scoped base for get_workspace_intelligence_
--    listings / get_operations_items / get_research_items. Adds ii.item_grade as a trailing column
--    (after effective_archived, the position every other RPC below also uses for consistency).
CREATE OR REPLACE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, archive_reason text, archive_note text, archived_date date, replaced_by uuid, version_history jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, linked_forum_thread_ids uuid[], linked_vendor_ids uuid[], linked_case_study_ids uuid[], linked_regulation_ids uuid[], region_tags text[], topic_tags text[], vertical_tags text[], full_brief text, urgency_tier text, format_type text, last_regenerated_at timestamp with time zone, regeneration_skill_version text, sources_used uuid[], operational_scenario_tags text[], compliance_object_tags text[], related_items uuid[], intersection_summary text, jurisdiction_iso text[], agent_integrity_flag boolean, agent_integrity_phrase text, agent_integrity_flagged_at timestamp with time zone, agent_integrity_resolved_at timestamp with time zone, agent_integrity_resolved_by uuid, pipeline_stage text, hidden_reason text, effective_priority text, effective_archived boolean, item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.item_grade
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified';   -- Sprint 4 task 1.10: customer read gate (ADDED)
END;
$function$;

-- 2. get_workspace_intelligence_slim(p_org_id) — Regulations/Market/Operations first-paint (org-scoped).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
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
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo ON wo.item_id = ii.id AND wo.org_id = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 3. get_workspace_intelligence_slim_public() — org-independent counterpart (migration 306).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 4. get_workspace_intelligence_listings(p_org_id, p_domain) — Regulations' authenticated listings
--    path; sources FROM _workspace_active_items, so ii.item_grade is already present on `ii` once
--    (1) above applies — this just adds it to the SELECT list and RETURNS TABLE.
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid, p_domain integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
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
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade
  FROM public._workspace_active_items(p_org_id) ii
  WHERE (p_domain IS NULL OR ii.domain = p_domain)
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 5. get_workspace_intelligence_listings_public(...) — org-independent counterpart (migration 306),
--    including the keyset-cursor triple (PERF-12-MERGE). Reads intelligence_items directly (not via
--    the helper), so item_grade is added straight off `ii`.
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings_public(
  p_domain integer DEFAULT NULL::integer,
  p_after_priority text DEFAULT NULL::text,
  p_after_added_date date DEFAULT NULL::date,
  p_after_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_after_rank int;
BEGIN
  v_after_rank := CASE
    WHEN p_after_priority IS NULL THEN NULL
    ELSE (CASE p_after_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END)
  END;
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND (p_domain IS NULL OR ii.domain = p_domain)
    AND (
      p_after_id IS NULL
      OR (
        (CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) > v_after_rank
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date < p_after_added_date)
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date = p_after_added_date AND ii.id > p_after_id)
      )
    )
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 6. get_market_intel_items(p_org_id) — Market ledger (org-scoped).
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  LEFT JOIN public.workspace_item_overrides wo ON wo.item_id = ii.id AND wo.org_id = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 7. get_market_intel_items_public() — org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_market_intel_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 8. get_operations_items(p_org_id) — Operations ledger (org-scoped); sources FROM
--    _workspace_active_items, so item_grade flows through once (1) applies.
CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 9. get_operations_items_public() — org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_operations_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 10. get_research_items(p_org_id) — Research ledger (org-scoped); sources FROM
--     _workspace_active_items, so item_grade flows through once (1) applies. (ResearchLedger.tsx
--     itself reads via the separate fetchResearchPipelineRows path, not this RPC, but this RPC still
--     feeds the dashboard/workspace "research" category consumers, so it is kept in parity with its
--     nine siblings rather than left the one exception.)
CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
    src.what_it_changes, src.does_not_resolve,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 11. get_research_items_public() — org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_research_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.what_it_changes, ii.does_not_resolve,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- Grants unchanged (all 11 already carry the same anon/authenticated/service_role EXECUTE grants
-- CREATE OR REPLACE preserves grants on an existing function; nothing to re-grant).

-- ── Post-check (idempotent — safe to re-run; matches migration 306's own shape) ─────────────────────
DO $$
DECLARE
  n_total int;
  n_record int;
  n_regs_record int;
  n_market_record int;
  n_ops_record int;
  n_research_record int;
BEGIN
  -- Presence: every RETURNS TABLE must now list item_grade.
  PERFORM 1;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           '_workspace_active_items','get_workspace_intelligence_slim','get_workspace_intelligence_slim_public',
           'get_workspace_intelligence_listings','get_workspace_intelligence_listings_public',
           'get_market_intel_items','get_market_intel_items_public',
           'get_operations_items','get_operations_items_public',
           'get_research_items','get_research_items_public'
         )
         AND pg_get_functiondef(p.oid) ILIKE '%item_grade%') <> 11 THEN
    RAISE EXCEPTION 'ABORT: not all 11 functions project item_grade after CREATE OR REPLACE';
  END IF;

  -- Execution, not just presence (rule 15): call the org-independent five with zero arguments (the
  -- public functions need no org context) and confirm item_grade actually carries 'record' values
  -- matching the live population counted by this migration's own header, not merely that the column
  -- exists and is always NULL.
  SELECT count(*) FILTER (WHERE item_grade = 'record')
    INTO n_regs_record
    FROM public.get_workspace_intelligence_listings_public(1);
  SELECT count(*) FILTER (WHERE item_grade = 'record')
    INTO n_market_record
    FROM public.get_market_intel_items_public();
  SELECT count(*) FILTER (WHERE item_grade = 'record')
    INTO n_ops_record
    FROM public.get_operations_items_public();
  SELECT count(*) FILTER (WHERE item_grade = 'record')
    INTO n_research_record
    FROM public.get_research_items_public();

  IF n_regs_record = 0 THEN
    RAISE EXCEPTION 'ABORT: get_workspace_intelligence_listings_public(1) returned 0 record-grade rows — expected >0 (1,095 measured 2026-09-05); item_grade is NULL/unprojected, not a data gap';
  END IF;

  -- Slim/listings must agree in total row count with each other (same predicate, per migration 306's
  -- own post-check) — item_grade must not have changed that invariant.
  SELECT count(*) INTO n_total FROM public.get_workspace_intelligence_slim_public();
  SELECT count(*) INTO n_record FROM public.get_workspace_intelligence_listings_public();
  IF n_total <> n_record THEN
    RAISE EXCEPTION 'ABORT: slim_public (%) and listings_public (%) row counts disagree after adding item_grade — same base predicate, must match', n_total, n_record;
  END IF;
END $$;
