-- Rollback for migration 164 — restore the pre-164 (gate-less) LIVE body of get_market_intel_items.
--
-- This reproduces the LANGUAGE sql body captured from pg_get_functiondef on 2026-07-11 (the state BEFORE
-- migration 164). Use ONLY to reverse 164. NOTE: this restores the P1 org-leak; reverse only if 164 breaks
-- a legitimate member call path and a fix cannot be forward-patched.

BEGIN;

DROP FUNCTION IF EXISTS public.get_market_intel_items(uuid);

CREATE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer, category text,
   item_type text, source_id uuid, source_url text, jurisdictions text[],
   transport_modes text[], verticals text[], status text, severity text,
   signal_band text, trajectory_points jsonb, confidence text, priority text,
   entry_into_force date, compliance_deadline date, next_review_date date,
   added_date date, last_verified timestamp with time zone, is_archived boolean,
   what_it_changes text, conversion_trigger text, cross_references text,
   effective_priority text, effective_archived boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
    AND ii.item_type IN ('market_signal', 'initiative')
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

GRANT EXECUTE ON FUNCTION public.get_market_intel_items(uuid) TO authenticated, service_role;

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema'
