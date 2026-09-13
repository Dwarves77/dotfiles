-- 319: get_workspace_recent_changes gains the UPDATED half of the "What changed" feed.
--
-- Defect D23, docs/plans/defect-fix-plan-2026-09-12.md: the dashboard's "What changed" card is fed
-- by this RPC (migration 232), which only ever returns items with added_date in the window, that is
-- NEWLY MINTED items. The brief chain regenerates EXISTING items and mints none, so a week of real
-- regeneration work rendered an empty card. Part (a) of this lane's fix (scripts/lib/changelog.mjs)
-- now writes item_changelog rows for a regenerated brief or a backfilled timeline; this migration is
-- the read side, unioning those rows into the feed.
--
-- Two trailing columns added: change_kind ('new' | 'updated') and change_date (the date of the
-- underlying change: added_date for a new item, the newest in-window item_changelog.change_date for
-- an updated one). An item both newly added AND changed in the same window reads 'new' (the stronger
-- fact) and is never duplicated across the two branches (the updated branch explicitly excludes ids
-- already selected by the new branch, matching the CTE precedence below).
--
-- CREATE OR REPLACE FUNCTION cannot widen a RETURNS TABLE (ERROR 42P13, migrations 272/310/316's own
-- documented precedent) -- this file DROPs the function before recreating it. No GRANT is repeated:
-- 232's own body carried none (the function relies on the default PUBLIC execute grant every plpgsql
-- function gets unless explicitly revoked), so recreating it changes nothing about who may call it.
--
-- ADDITIVE AND BACKWARD COMPATIBLE (the coordinator applies this before the code merges, per standing
-- rule 3 / the lane brief): old code that reads only the six original columns (id, legacy_id, title,
-- priority, effective_priority, added_date) keeps working unchanged against the two new trailing
-- columns it never asked for.
--
-- PRE-CHECK (md5 of the live function body this migration replaces -- run again immediately before
-- applying; if the md5 differs, STOP and reconcile against the new live body first, per rule 15
-- "attack, don't assert presence"):
--   SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'get_workspace_recent_changes';
--   -- Expected (2026-09-13, this lane, verified live via Supabase MCP execute_sql, read-only):
--   -- 01669d7b1a24d39665011c832a32260f (informational only -- the coordinator's own re-check before
--   -- applying is the gate; this migration's correctness does not depend on the hash matching, only
--   -- on the live body read during this lane matching the repo's tracked 232 body byte for byte,
--   -- which it does).

drop function if exists public.get_workspace_recent_changes(uuid, integer);

create or replace function public.get_workspace_recent_changes(p_org_id uuid, p_days integer default 7)
returns table(
  id uuid,
  legacy_id text,
  title text,
  priority text,
  effective_priority text,
  added_date date,
  change_kind text,
  change_date date
)
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  WITH active AS (
    SELECT ii.id, ii.legacy_id, ii.title, ii.priority, ii.effective_priority, ii.added_date
    FROM public._workspace_active_items(p_org_id) ii
  ),
  new_items AS (
    SELECT
      a.id, a.legacy_id, a.title, a.priority, a.effective_priority, a.added_date,
      'new'::text AS change_kind,
      a.added_date AS change_date
    FROM active a
    WHERE a.added_date >= (current_date - GREATEST(p_days, 1))
  ),
  updated_items AS (
    -- An item already selected as 'new' above is never also read as 'updated' (the stronger fact
    -- wins, per this migration's own header): excluded here by id, not re-decided downstream.
    SELECT
      a.id, a.legacy_id, a.title, a.priority, a.effective_priority, a.added_date,
      'updated'::text AS change_kind,
      MAX(c.change_date) AS change_date
    FROM active a
    JOIN public.item_changelog c ON c.item_id = a.id
    WHERE c.change_type = 'UPDATED'
      AND c.change_date >= (current_date - GREATEST(p_days, 1))
      AND a.id NOT IN (SELECT n.id FROM new_items n)
    GROUP BY a.id, a.legacy_id, a.title, a.priority, a.effective_priority, a.added_date
  ),
  unioned AS (
    SELECT * FROM new_items
    UNION ALL
    SELECT * FROM updated_items
  )
  SELECT u.id, u.legacy_id, u.title, u.priority, u.effective_priority, u.added_date, u.change_kind, u.change_date
  FROM unioned u
  ORDER BY
    CASE u.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    u.change_date DESC,
    u.id ASC
  LIMIT 500;
END;
$function$;
