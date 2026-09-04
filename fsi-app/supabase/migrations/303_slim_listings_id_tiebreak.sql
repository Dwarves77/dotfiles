-- 303 — get_workspace_intelligence_slim: add id ASC tiebreak to ORDER BY
--
-- SLIM-ORDER lane (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §14.4 follow-up):
-- `get_workspace_intelligence_slim` (/operations, /market first-paint pagination via
-- fetchResourcesOnly) carries the SAME priority-band-grouping defect FIRSTPAGE fixed for
-- `/regulations`. The RPC's own ORDER BY ends `..., ii.added_date DESC;` with NO `id` tiebreak,
-- so when PostgREST outer `.order("added_date", desc).order("id", asc)` is applied during
-- pagination, it REPLACES the RPC's internal priority-band CASE rank ordering (exactly like
-- the listings defect). Live-confirmed SQL, 2026-09-04: under the outer order alone, /operations
-- and /market's first 60 rows are 100% MODERATE; under the RPC's own order, they are 14 CRITICAL,
-- 30 HIGH, 16 MODERATE — identical defect to the one FIRSTPAGE fixed for /regulations, just on
-- a different surface.
--
-- THE FIX: add `, ii.id ASC` to the function's own ORDER BY, matching what
-- `get_workspace_intelligence_listings` (migration 272, live-confirmed §14) already carries.
-- Once this tiebreak is live, buildWorkspaceItemsQuery's allowlist LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER
-- (supabase-server.ts) can add `"get_workspace_intelligence_slim"` — that single entry drop will let
-- the RPC's own order survive pagination, fixing the priority-band-rank loss on /operations and /market
-- (the same fix strategy as /regulations, applied now to the other affected surface).
--
-- SHAPE: CREATE OR REPLACE the entire function body (idempotent; the new definition will be identical
-- to the old except for the one `, ii.id ASC` addition to the ORDER BY). The function is small and
-- self-contained (no internal procedures or triggers), so in-place patch is unnecessary — simpler to
-- re-verify the whole body and re-create in one pass. No other RPC is touched.
--
-- SELF-CHECK SQL (run read-only before writing this file, 2026-09-04, via Supabase MCP `execute_sql`,
-- project kwrsbpiseruzbfwjpvsp — NO write performed by this lane; every number below is what PART 1
-- itself re-derives and re-checks at apply time):
--
--   SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_workspace_intelligence_slim';
--   -- => 02936dfa040b36c54bfb06343e217bcc (length 1729) — THE v_pre_md5 PART 1 guards on.
--
--   -- the ORDER BY anchor, exactly 1 occurrence:
--   SELECT (length(def)-length(replace(def,'ORDER BY'||chr(10)||
--          '    CASE COALESCE(wo.priority_override, ii.priority)'||chr(10)||
--          '      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,'||chr(10)||
--          '    ii.added_date DESC;','')))
--            / length('ORDER BY'||chr(10)||
--          '    CASE COALESCE(wo.priority_override, ii.priority)'||chr(10)||
--          '      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,'||chr(10)||
--          '    ii.added_date DESC;')
--     FROM (SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n
--            ON n.oid=p.pronamespace WHERE n.nspname='public'
--            AND p.proname='get_workspace_intelligence_slim') s;
--   -- => 1
--
-- POST-APPLY VERIFICATION (to run after this migration is actually applied — not run by this lane,
-- Supabase MCP is read-only for this lane):
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_workspace_intelligence_slim';
--   -- expect: ORDER BY ... ii.added_date DESC, ii.id ASC;
--   (at the very end, before the final semicolon)
--
-- Reversible: re-apply this migration with the old body (remove `, ii.id ASC` from ORDER BY)
-- restores the pre-303 definition.

DO $$
DECLARE
  v_def       text;
  v_pre_md5   constant text := '02936dfa040b36c54bfb06343e217bcc';

  v_old_order constant text := 'ORDER BY'||chr(10)||
'    CASE COALESCE(wo.priority_override, ii.priority)'||chr(10)||
'      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,'||chr(10)||
'    ii.added_date DESC;';

  v_new_order constant text := 'ORDER BY'||chr(10)||
'    CASE COALESCE(wo.priority_override, ii.priority)'||chr(10)||
'      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,'||chr(10)||
'    ii.added_date DESC, ii.id ASC;';

  v_newdef    text;
  v_count     int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_slim';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 303: public.get_workspace_intelligence_slim not found';
  END IF;

  -- Check if already applied (new order already present)
  IF position(v_new_order IN v_def) > 0 THEN
    RAISE NOTICE '303: already applied (ii.id ASC already in ORDER BY) — no-op';
    RETURN;
  END IF;

  -- Guard on the exact live definition
  IF md5(v_def) <> v_pre_md5 THEN
    RAISE EXCEPTION 'ABORT 303: live get_workspace_intelligence_slim md5 % differs from the body this patch was written for (%); read the live definition and re-derive before applying', md5(v_def), v_pre_md5;
  END IF;

  -- Count-guard: exactly 1 occurrence of the old ORDER BY
  v_count := (length(v_def) - length(replace(v_def, v_old_order, ''))) / length(v_old_order);
  IF v_count <> 1 THEN RAISE EXCEPTION 'ABORT 303: expected exactly 1 occurrence of the ORDER BY anchor, found %', v_count; END IF;

  -- Apply the replacement
  v_newdef := replace(v_def, v_old_order, v_new_order);
  IF v_newdef = v_def THEN RAISE EXCEPTION 'ABORT 303: replacement produced no change'; END IF;

  EXECUTE v_newdef;

  -- Post-patch verification
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_slim';
  IF position(v_new_order IN v_def) = 0 THEN
    RAISE EXCEPTION 'ABORT 303: post-patch definition does not carry the new ORDER BY with ii.id ASC';
  END IF;

  RAISE NOTICE '303 OK: get_workspace_intelligence_slim ORDER BY now includes ii.id ASC tiebreak; post md5 %', md5(v_def);
END $$;
