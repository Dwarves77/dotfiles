-- Migration 134: fix the broken get_research_items + get_technology_items routing RPCs.
--
-- BUG (instance): both RPCs SELECT `ii.what_it_changes` and `ii.does_not_resolve` FROM
-- `_workspace_active_items(p_org_id) ii`, but that shared scoping function (migration 073) does NOT
-- expose those two columns — it exposes everything else the RPCs select (which is why
-- get_operations_items, selecting the same set MINUS these two, works). Result: both RPCs raise
-- "column ii.what_it_changes does not exist" at call time -> return empty -> the customer surfaces
-- that consume them fall through their fail-open path (the /research wrong-surface leak's root cause).
--
-- FIX: keep the RETURNS signature unchanged (so CREATE OR REPLACE is legal — no DROP, no return-type
-- change) and source the two missing columns from intelligence_items via a 1:1 id join. The join does
-- not change row scope: _workspace_active_items already applied the workspace + provenance gate; the
-- join only pulls two item-level columns. The provenance/workspace gate and the item_type routing
-- predicate are preserved verbatim.
--
-- The fail-OPEN that turned this instance bug into a leak is the CLASS defect; it is fixed separately
-- at the surface layer (the surfaces must fail CLOSED on RPC error, never fall through to an ungated
-- path). This migration fixes only the instance (the RPCs themselves).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean)
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
    src.what_it_changes, src.does_not_resolve,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE ii.item_type IN ('research_finding')
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_technology_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean)
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
    src.what_it_changes, src.does_not_resolve,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE ii.item_type IN ('technology', 'innovation', 'tool')
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMIT;
