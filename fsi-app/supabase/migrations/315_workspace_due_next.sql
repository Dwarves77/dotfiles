-- 315, get_workspace_due_next: the read the dashboard's "Due next" card actually asks for.
--
-- ROOT CAUSE THIS MIGRATION FIXES [CONFIRMED, lane duenext, live reads via Supabase MCP
-- execute_sql, 2026-09-08]. The Due-next card is fed by `get_workspace_intelligence_dashboard`
-- (migration 064/077), whose ORDER BY is
--     CASE effective_priority WHEN 'CRITICAL' THEN 1 ... END, added_date DESC, id ASC LIMIT 50
-- i.e. a slice chosen by PRIORITY. The card's question is "what is due soonest", which is a
-- different question, so the slice answers it only by accident. Measured live against org
-- a0000000-0000-0000-0000-000000000001 on 2026-09-08:
--
--   * the workspace's active verified set (_workspace_active_items) is 1,433 rows;
--   * exactly 45 of those carry a FUTURE binding date under the rule the UI applies
--     (src/lib/dashboard/row-fields.ts `dueInfo`): 5 via ii.compliance_deadline >= current_date
--     and 40 via a future item_timelines.milestone_date;
--   * the priority-ordered LIMIT 50 slice contains 23 of those 45 and 0 of the 5
--     compliance_deadline ones. The nearest future date in the whole workspace is 2026-09-08;
--     nothing guarantees the slice holds it, and after any priority reshuffle the overlap can
--     fall to zero with no data change at all.
--
-- WHAT THIS ADDS: one new, bounded, workspace-scoped read that orders by the binding date itself.
-- It changes NO existing function. `get_workspace_intelligence_dashboard` keeps its priority
-- ordering, because the rest of the dashboard payload legitimately wants the top items by
-- priority; this function is the second, purpose-built read the Due-next card consumes.
--
-- THE DATE RULE, AND WHERE IT AGREES WITH THE UI. `dueInfo` (row-fields.ts) builds its candidate
-- list from EXACTLY TWO sources: `r.complianceDeadline` and every `r.timeline[].date`, keeps only
-- candidates on or after today (UTC), and takes the minimum. This function computes the same
-- minimum in SQL:
--     LEAST( compliance_deadline when >= current_date,
--            MIN(item_timelines.milestone_date) where milestone_date >= current_date )
--
-- It deliberately does NOT consider `entry_into_force` or `next_review_date`, and that is a
-- DIFFERENCE FROM THE BRIEF, stated here rather than papered over: those two columns are projected
-- by the dashboard RPC but they are never mapped onto a Resource by
-- `mapWorkspaceItemRows` (src/lib/supabase-server.ts), the UI type carries no field for either, and
-- `dueInfo` therefore cannot see them. A SQL read that selected on them would hand the card rows
-- whose date the card cannot reproduce, and `buildDueNextRows` would filter them straight back out:
-- the same class of "the read answers a different question from the card" defect this migration
-- exists to remove. Widening the UI's own rule to those two columns is a product decision about
-- what "due" means, not a read-layer decision, so it is left to the operator; if it is ever taken,
-- the LEAST() below and `dueInfo`'s candidate list must be widened in the SAME change.
--
-- (`compliance_deadline` itself was likewise unreachable: `mapWorkspaceItemRows` never set
-- `Resource.complianceDeadline`, so all 5 of those items were invisible to the card no matter which
-- rows the read returned. That is a code defect and is fixed in the same PR as this migration.)
--
-- BOUNDED (F38/F39): p_limit defaults to 24 and is hard-clamped to [1, 100] inside the function, so
-- no caller can turn this into a corpus-scale read. The card renders 5 rows (DUE_NEXT_CAP); the
-- default of 24 leaves headroom for the sibling lane's widened window without a second round trip.
--
-- WORKSPACE-SCOPED THROUGH THE SAME SEAM AS EVERY OTHER WORKSPACE READ: it sources rows from
-- `public._workspace_active_items(p_org_id)`, which itself calls `public._assert_org_membership`
-- and applies the customer read gate (NOT COALESCE(wo.is_archived, ii.is_archived) AND
-- provenance_status = 'verified'). This function repeats the membership assert directly as well,
-- matching every sibling RPC's shape. No new predicate, no new visibility.
--
-- COLUMN LIST: byte-identical to `get_workspace_intelligence_dashboard`'s live RETURNS TABLE
-- (captured 2026-09-08 via pg_get_functiondef), plus ONE new trailing column `next_binding_date`.
-- Trailing-only, so `mapWorkspaceItemRows` maps these rows with no change, exactly as it already
-- maps the dashboard RPC's.
--
-- APPLY ORDER: standalone. Depends only on `_workspace_active_items` and `item_timelines`, both
-- long-live. Per CLAUDE.md rule 3 (two-track policy) the coordinator applies this DDL live BEFORE
-- the dependent code lands; the code side fails soft if it is absent (the read logs and the card
-- falls back to the dashboard payload's own rows), so an apply-after does not break the page.
--
-- IDEMPOTENT: DROP FUNCTION IF EXISTS on both the defaulted and the explicit-arity signature before
-- CREATE, then explicit GRANTs. Safe to re-run. (DROP-before-CREATE rather than CREATE OR REPLACE
-- for the reason migration 310's header records: changing a RETURNS TABLE under CREATE OR REPLACE
-- raises 42P13.)
--
-- REVERSIBLE: `DROP FUNCTION IF EXISTS public.get_workspace_due_next(uuid, integer);` -- this
-- migration creates a new function and alters nothing that existed before it, so the rollback is
-- the drop alone.

BEGIN;

DROP FUNCTION IF EXISTS public.get_workspace_due_next(uuid, integer);
DROP FUNCTION IF EXISTS public.get_workspace_due_next(uuid);

CREATE FUNCTION public.get_workspace_due_next(
  p_org_id uuid,
  p_limit  integer DEFAULT 24
)
RETURNS TABLE(
  id uuid,
  legacy_id text,
  title text,
  summary text,
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
  entry_into_force date,
  compliance_deadline date,
  next_review_date date,
  added_date date,
  last_verified timestamp with time zone,
  is_archived boolean,
  effective_priority text,
  effective_archived boolean,
  jurisdiction_iso text[],
  next_binding_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  WITH active AS (
    SELECT ii.*
    FROM public._workspace_active_items(p_org_id) ii
  ),
  dated AS (
    SELECT
      a.*,
      LEAST(
        CASE WHEN a.compliance_deadline >= current_date THEN a.compliance_deadline END,
        (
          SELECT MIN(t.milestone_date)
          FROM public.item_timelines t
          WHERE t.item_id = a.id
            AND t.milestone_date >= current_date
        )
      ) AS nbd
    FROM active a
  )
  SELECT
    d.id, d.legacy_id, d.title, d.summary, d.tags, d.domain,
    d.category, d.item_type, d.source_id, d.source_url,
    d.jurisdictions, d.transport_modes, d.verticals, d.status,
    d.severity, d.confidence, d.priority, d.entry_into_force,
    d.compliance_deadline, d.next_review_date, d.added_date,
    d.last_verified, d.is_archived,
    d.effective_priority, d.effective_archived, d.jurisdiction_iso,
    d.nbd
  FROM dated d
  WHERE d.nbd IS NOT NULL
  ORDER BY d.nbd ASC, d.id ASC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_workspace_due_next(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_due_next(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_due_next(uuid, integer) TO service_role;

COMMIT;

-- POST-CHECK (run as service_role; expect rows ordered by next_binding_date ascending, every
-- next_binding_date >= current_date, and a count <= the limit passed):
--   SELECT next_binding_date, effective_priority, title
--     FROM public.get_workspace_due_next('a0000000-0000-0000-0000-000000000001'::uuid, 24);
--
-- Expected against the corpus measured 2026-09-08: 24 rows, first next_binding_date 2026-09-08,
-- then 2026-09-30 (x3), 2026-10-01, 2026-11-18, 2026-11-21, 2026-11-29 ... -- i.e. the Sep 30 /
-- Nov 18 / Dec 30 dates the operator can already see on /regulations, which the priority-ordered
-- slice never surfaced.
--
-- NEGATIVE POST-CHECK (the proof that this is not the priority slice): the first row is LOW
-- priority. Under the old read it could not have been in the first five of anything.
