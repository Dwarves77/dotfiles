-- subject: Migration 387 (lane DEAD-1d, 2026-10-10): drops the three org-scoped category RPCs get_operations_items(uuid), get_research_items(uuid) and get_technology_items(uuid), which no application code, script or other database function calls since the caller-less supabase-server.ts fetchers were deleted; get_market_intel_items(uuid) stays (src/app/api/health/surfaces/route.ts calls it). NOT APPLIED.
-- 387 -- drop caller-less category RPCs (lane DEAD-1d, 2026-10-10).
--
-- NOT APPLIED. Authored by lane DEAD-1d with no database access; the coordinator's executor applies it after CI is green
-- (two-track policy, CLAUDE.md standing rule 3: no code depends on these functions, so the schema DDL and the code PR
-- can land in either order). Requires migrations 272 and 134 (the last definitions of the four functions).
--
-- WHY. F47 (db-object-reference) went red on PR 1093 with "DEAD FUNCTION(S): get_operations_items, get_research_items"
-- once the TypeScript fetchers that called them (fetchOperationsItems, fetchResearchItems, fetchTechnologyItems) were
-- deleted as caller-less. The one grep behind this file (git grep -n -w over fsi-app, 2026-10-10, excluding migrations
-- and docs):
--   * get_operations_items, get_research_items, get_technology_items: no .rpc() call, no script, no workflow. Remaining
--     hits are comments, point-in-time audit records, db-catalog.json (refreshed by the executor) and the static
--     migration tests that read the OLD migration files (371_definer_hygiene.test.mjs reads files numbered below 371;
--     supabase-server-category-rpc-paging.test.mjs reads migration 272), which a new file does not change.
--   * In the migration tree the only SQL body that calls them is migration 316's one-time apply-time self-check (a DO
--     block), not a stored function; this file re-checks pg_proc before dropping.
--   * get_market_intel_items is KEPT: src/app/api/health/surfaces/route.ts line 148 calls it by name.
-- The org-independent siblings get_operations_items_public, get_research_items_public and get_market_intel_items_public
-- (migration 306) are the live readers and are untouched.
--
-- WHAT THIS DOES. Aborts if any other function in public names one of the three in its body; drops the three with plain
-- DROP FUNCTION (no CASCADE, so an unexpected dependent object fails the statement and rolls the transaction back); then
-- re-reads the catalog and asserts the three are gone and the four live readers remain.
--
-- WHAT THIS DOES NOT DO. No table, row or column is touched. _workspace_active_items and every other function keep
-- their definitions and grants.

BEGIN;

DO $$
DECLARE
  v_fn text;
BEGIN
  SELECT p.proname INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT IN ('get_operations_items', 'get_research_items', 'get_technology_items')
     AND p.prosrc ~ '(^|[^a-z_])(get_operations_items|get_research_items|get_technology_items)([^a-z_]|$)'
   LIMIT 1;
  IF v_fn IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: function public.% names one of the category RPCs in its body; repoint it before dropping', v_fn;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_operations_items(uuid);
DROP FUNCTION IF EXISTS public.get_research_items(uuid);
DROP FUNCTION IF EXISTS public.get_technology_items(uuid);

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['get_operations_items', 'get_research_items', 'get_technology_items'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name) THEN
      RAISE EXCEPTION 'SELF-CHECK FAILED: public.% still exists', v_name;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['get_market_intel_items', 'get_market_intel_items_public', 'get_operations_items_public', 'get_research_items_public'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name) THEN
      RAISE EXCEPTION 'SELF-CHECK FAILED: public.% is missing; it must be untouched', v_name;
    END IF;
  END LOOP;
END $$;

COMMIT;
