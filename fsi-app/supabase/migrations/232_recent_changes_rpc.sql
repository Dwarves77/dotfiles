-- 232: window-scoped What-changed feed (operator-directed 2026-08-01).
-- The dashboard RPC (064) is LIMIT 50 by priority, so the home This-week
-- section went blind to in-window additions once the corpus outgrew the
-- slice (216 in-window items rendered as "nothing"). This RPC is bounded
-- by the DATE WINDOW, not a priority cap: all verified live items added in
-- the last p_days, priority-ordered, defensive 500 ceiling.
-- Applied to the live DB 2026-08-01 via MCP apply_migration (schema-first
-- per the two-track policy); this file is the repo audit copy.
CREATE OR REPLACE FUNCTION public.get_workspace_recent_changes(p_org_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(id uuid, legacy_id text, title text, priority text, effective_priority text, added_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT ii.id, ii.legacy_id, ii.title, ii.priority, ii.effective_priority, ii.added_date
  FROM public._workspace_active_items(p_org_id) ii
  WHERE ii.added_date >= (current_date - GREATEST(p_days, 1))
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC
  LIMIT 500;
END;
$function$;
