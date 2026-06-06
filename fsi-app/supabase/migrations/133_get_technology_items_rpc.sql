-- Migration 133: get_technology_items(p_org_id uuid) — Technology surface RPC.
--
-- Built EXACTLY like get_research_items in migration 125: same RETURNS signature,
-- same _workspace_active_items source, same provenance gate (provenance_status =
-- 'verified' enforced by _workspace_active_items per migration 117/119), same
-- _assert_org_membership guard, same ORDER BY. Only the item_type predicate differs:
--   get_research_items  → item_type IN ('research_finding')
--   get_technology_items → item_type IN ('technology', 'innovation', 'tool')
--
-- The RETURNS signature is verbatim from get_research_items (migration 125 lines
-- 70-71) to maintain a stable shape. does_not_resolve is carried because it is a
-- column on intelligence_items and the signature must be compatible with future
-- RPC composition. Callers that do not need it ignore it.
--
-- Note: 3 institutional-body rows are typed 'tool' (known debt — EEA, ECLAC,
-- OECD Environment). They will appear in this result set when their provenance_status
-- reaches 'verified'. No special-casing here; the data layer is honest.

BEGIN;

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
    ii.what_it_changes, ii.does_not_resolve,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE
    ii.item_type IN ('technology', 'innovation', 'tool')
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
