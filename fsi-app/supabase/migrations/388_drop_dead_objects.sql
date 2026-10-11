-- subject: Migration 388 (lane DB-2, 2026-10-11, register DB-1 sections 2 and 3): drops the two caller-less functions get_workspace_intelligence_aggregates_scoped(uuid, jsonb) and reorder_user_list_item(uuid, text, text, text, text, text[]) and the unread view census_rollup_by_surface; every other DEAD, NO-READER or MIGRATION-ONLY object the register lists is HELD and named below with its reason. NOT APPLIED.
-- 388 -- drop dead objects (lane DB-2, 2026-10-11).
--
-- NOT APPLIED. Authored by lane DB-2 with no database access; the coordinator's executor applies it after CI is green (two-track policy,
-- CLAUDE.md standing rule 3: no code in src or scripts calls any dropped object, so the schema DDL and the code can land in either order).
-- Source of truth: docs/audits/whole-build-audit-2026-10-11/db-1-schema-traceability-2026-10-11.md, the rows cited per object below. The register
-- is a static replay of the migration tree against the 2026-10-11 catalog; every claim here is a repo-side grep result.
--
-- WHAT THIS DROPS, WITH THE REGISTER ROW AND THE EVIDENCE.
--   * function get_workspace_intelligence_aggregates_scoped(uuid, jsonb): register section 2, DEAD, SECURITY DEFINER, [CONFIRMED: 0 rpc sites, 0
--     product-code words, 0 trigger, policy, view or live-function referrers]. The last definitions are migrations 073/077 (grants 077, search_path 160).
--     The only mentions under src are two comments (src/lib/surface-of.mjs, src/lib/dashboard/surface-coverage.ts) describing a fallback that no
--     longer exists in code; get_surface_counts (migration 148) is the live path.
--   * function reorder_user_list_item(uuid, text, text, text, text, text[]): register section 2, DEAD, SECURITY DEFINER, [CONFIRMED]. Created by 238
--     for the personal list order; its table user_list_order was dropped by 343, so the body reads a table that no longer exists.
--   * view census_rollup_by_surface: register section 3, NO-READER, [CONFIRMED: 0 code sites, 0 live-function, view or policy readers]. Created by 222
--     over census_worklist and coverage_gap_census_findings. A view holds no rows of its own, so no data is lost; both base tables are untouched.
--
-- WHAT THIS DOES NOT DROP (HELD; each is a register row marked [WORK: db2-schema-subtract] that this lane could not close inside its write set or
-- under a prior ruling; the reasons are in docs/ops/session-log.d/2026-10-11-db2-schema-subtract.md).
--   * tables with rows at the 2026-09-30 export (a table with rows is reported, never dropped): coverage_gap_candidates (109 rows),
--     coverage_gap_census_findings (116 rows), sensitive_field_policy (5 rows).
--   * publish_aggregate, bucket_value, bucket_width_multiplier and the table aggregate_query_log (0 rows): dropping them breaks a live attack
--     (scripts/verify/attacks/rls-view-function-attacks.mjs lists publish_aggregate in SYSTEM_ONLY_FUNCTIONS and its stack run asserts five
--     functions) and a primary-key map entry (scripts/lib/table-primary-keys.mjs), both outside this lane's write set.
--   * derived_values_admissible: the sanctioned read path of the pollution barrier (RD-56, F31, attack RLS-VF-VIEWS-READ name it); dropping it
--     rewrites a governance invariant, which is a coordinator ruling.
--   * propagation_queue_depth: spec 08 section 2.2 names it as the visible flywheel tension and scripts/harness-runs/propagation/FAMILY.md
--     documents it, outside this lane's write set.
--   * gate_a_health_compute and gate_a_health_refresh: the writer path of gate_a_health_cache, which gate_a_health() serves to
--     /api/health/surfaces; deliberately unscheduled by operator ruling 2026-08-10 and by build mode (rule 16), so not_computed is the expected
--     state until a cadence is set.
--   * move_override_notes_to_item_notes: the staged one-time data move of migration 358, run once after the consumer code merges; whether it has
--     run is a live read (the session log stages the SQL).
--
-- WHAT THIS DOES. The pre-check aborts if any other function in public names a dropped object in its body or any other view's definition names
-- a dropped object (Postgres does not track a function call inside a plpgsql body). It then drops the three objects with plain DROP (no CASCADE, so an
-- unexpected dependent object fails the statement and rolls the transaction back), and re-reads the catalog: the three are gone and the held neighbours
-- remain.
--
-- WHAT THIS DOES NOT DO. No table, row or column is touched.

BEGIN;

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT p.proname INTO v_name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT IN ('get_workspace_intelligence_aggregates_scoped', 'reorder_user_list_item')
     AND p.prosrc ~ '(^|[^a-z_])(get_workspace_intelligence_aggregates_scoped|reorder_user_list_item|census_rollup_by_surface)([^a-z_]|$)'
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: function public.% names a dropped object in its body; repoint it before dropping', v_name;
  END IF;

  SELECT v.viewname INTO v_name
    FROM pg_views v
   WHERE v.schemaname = 'public'
     AND v.viewname <> 'census_rollup_by_surface'
     AND v.definition ~ '(^|[^a-z_])(get_workspace_intelligence_aggregates_scoped|reorder_user_list_item|census_rollup_by_surface)([^a-z_]|$)'
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: view public.% names a dropped object in its definition; repoint it before dropping', v_name;
  END IF;
END $$;

DROP VIEW IF EXISTS public.census_rollup_by_surface;
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_aggregates_scoped(uuid, jsonb);
DROP FUNCTION IF EXISTS public.reorder_user_list_item(uuid, text, text, text, text, text[]);

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['get_workspace_intelligence_aggregates_scoped', 'reorder_user_list_item'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name) THEN
      RAISE EXCEPTION 'SELF-CHECK FAILED: public.% still exists', v_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname = 'census_rollup_by_surface') THEN
    RAISE EXCEPTION 'SELF-CHECK FAILED: public.% still exists', 'census_rollup_by_surface';
  END IF;

  -- The held neighbours are untouched: functions first, then views and the two census tables.
  FOREACH v_name IN ARRAY ARRAY['gate_a_health_compute', 'gate_a_health_refresh', 'move_override_notes_to_item_notes', 'publish_aggregate', 'bucket_value', 'bucket_width_multiplier'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name) THEN
      RAISE EXCEPTION 'SELF-CHECK FAILED: public.% is missing; it must be untouched', v_name;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['derived_values_admissible', 'propagation_queue_depth', 'census_worklist', 'coverage_gap_census_findings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v', 'r') AND c.relname = v_name) THEN
      RAISE EXCEPTION 'SELF-CHECK FAILED: public.% is missing; it must be untouched', v_name;
    END IF;
  END LOOP;
END $$;

COMMIT;
