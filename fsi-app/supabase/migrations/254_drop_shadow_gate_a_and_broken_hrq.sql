-- 254 — Retire the out-of-repo DDL the database-layer census found (docs/audits/db-layer-census-2026-08-11.md).
--
-- Drops 16 functions and 1 table, all of which exist in production and are created by NO committed migration.
-- Same content-gated tombstone shape as migration 219: measure first, ABORT on any drift from what the census
-- measured, drop only then.
--
-- WHAT GOES, AND WHY EACH IS SAFE
--
-- 1. FOUR BROKEN hrq_* FUNCTIONS. hrq_enqueue / hrq_escalate / hrq_exit / hrq_record_attempt all read and
--    write public.hold_resolution_queue, which THIS REPO's migration 219 dropped on 2026-07-19 (superseded by
--    drain_worklist; 32/39 rows already present there, 6 verified, 1 gone, 0 needing migration). The table
--    went, the API stayed, and every one of these throws on a missing relation the moment it is called. This
--    is the second half of a cleanup that only ever completed one half — and it survived nine months of
--    reviews because the functions were not in the repo for a reviewer to see next to the DROP.
--
-- 2. TWELVE SHADOW gate_a_* FUNCTIONS. gate_a_scan and its helper chain re-implement, in SQL, the prose-fact
--    grounding scan that fsi-app/src/lib/agent/gate-a-scan.mjs implements in TypeScript. Both carry the
--    version literal '2026-07-30.1', hand-copied, with nothing enforcing that they stay equal. NOTHING calls
--    the SQL copy: gate_a_scan_and_store and gate_a_extract_tokens (the two entry points) have zero callers in
--    code, docs, migrations, other database objects, or pg_cron. The live path is TypeScript —
--    canonical-pipeline.ts writes item_gate_a_state directly — so removing these changes no behaviour.
--    remediation-discipline forbids this in words already: "when the real mechanism is wired, the inferior
--    duplicate folds into it or dies, never both left standing."
--
-- 3. gate_a_route_b_baseline (430 rows). Referenced by NOTHING anywhere — no code, no migration, no doc, no
--    other database object. A route-B before/after baseline captured out-of-band and never wired to a reader.
--    THE ROWS ARE NOT DESTROYED: all 430 are exported verbatim to
--    docs/audits/gate-a-route-b-baseline-2026-08-11.csv (id, item_type, provenance_status, valid_before,
--    failures_before — including the full failure detail) and committed in the same PR as this migration. The
--    measurement record survives in git, which is a better home for a frozen baseline than a live table nobody
--    reads. Distribution at export: 233 quarantined / 135 verified / 57 unverified / 5 pending_human_verify,
--    across 11 item_types.
--
-- WHAT DELIBERATELY STAYS
--   gate_a_health, gate_a_health_compute, gate_a_health_refresh, gate_a_health_cache — the health surface is
--     LIVE (/api/health/surfaces reads it). Its refresh is deliberately unscheduled per the operator ruling of
--     2026-08-10; dormant-by-ruling is not dead. They keep their F24 entries pending a migration-home backfill.
--   capture_worker_fetch — the runbook-invoked, no-metered-spend document capture path. Not dead; invoked by
--     a human running SQL, which a code-only census cannot see.
--   next_uncensused_portal_candidates — dormant capability, not breakage. Adopt-or-drop is a product call.
--   item_gate_a_state — 984 live rows, written by the TypeScript pipeline. Untouched.
--
-- REVERSIBILITY. The dropped functions are recoverable only from this file's history plus the live-DB
-- definitions captured in the census; they are being removed precisely because they are duplicates or broken,
-- so re-creating them is never the right recovery. The table's DATA is fully recoverable from the committed CSV.

DO $$
DECLARE
  baseline_rows bigint;
  external_deps int;
  ts_version text;
BEGIN
  -- GATE 1: hold_resolution_queue must still be absent. If something re-created it, the hrq_* functions are
  -- no longer broken and this migration's premise is wrong — stop and re-audit rather than drop a live API.
  IF to_regclass('public.hold_resolution_queue') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: hold_resolution_queue EXISTS again — the hrq_* functions may be live. Re-audit before dropping.';
  END IF;

  -- GATE 2: the baseline table must be exactly what was exported. A different count means the CSV is not a
  -- faithful copy and dropping would lose rows.
  SELECT count(*) INTO baseline_rows FROM public.gate_a_route_b_baseline;
  RAISE NOTICE 'TOMBSTONE gate_a_route_b_baseline: % rows at drop (exported 430)', baseline_rows;
  IF baseline_rows <> 430 THEN
    RAISE EXCEPTION 'ABORT: gate_a_route_b_baseline has % rows, not the 430 exported to docs/audits/gate-a-route-b-baseline-2026-08-11.csv — re-export before dropping.', baseline_rows;
  END IF;

  -- GATE 3: nothing OUTSIDE the drop set may depend on anything inside it. Measured NONE at census time; if a
  -- new caller appeared, dropping would break it.
  SELECT count(DISTINCT dep.proname) INTO external_deps
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  JOIN pg_depend d ON d.refobjid = p.oid
  JOIN pg_proc dep ON dep.oid = d.objid
  WHERE p.proname = ANY (ARRAY['gate_a_collapse_pct','gate_a_contains_token','gate_a_deadline_tokens',
        'gate_a_derived_covered','gate_a_extract_tokens','gate_a_figure_tokens','gate_a_is_citation_line',
        'gate_a_norm','gate_a_obligation_near','gate_a_scan','gate_a_scan_and_store','gate_a_ws_class',
        'hrq_enqueue','hrq_escalate','hrq_exit','hrq_record_attempt'])
    AND dep.proname <> ALL (ARRAY['gate_a_collapse_pct','gate_a_contains_token','gate_a_deadline_tokens',
        'gate_a_derived_covered','gate_a_extract_tokens','gate_a_figure_tokens','gate_a_is_citation_line',
        'gate_a_norm','gate_a_obligation_near','gate_a_scan','gate_a_scan_and_store','gate_a_ws_class',
        'hrq_enqueue','hrq_escalate','hrq_exit','hrq_record_attempt']);
  IF external_deps > 0 THEN
    RAISE EXCEPTION 'ABORT: % function(s) outside the drop set now depend on it — re-audit.', external_deps;
  END IF;

  -- GATE 4: the live path must still be the TypeScript one. item_gate_a_state carries the version the scanner
  -- stamped; if it ever showed a version the SQL copy produced and TypeScript did not, the SQL copy would be
  -- load-bearing after all. Informational-but-recorded: both sides read 2026-07-30.1 at census time.
  SELECT max(gate_a_version) INTO ts_version FROM public.item_gate_a_state;
  RAISE NOTICE 'item_gate_a_state max gate_a_version = % (TypeScript GATE_A_VERSION was 2026-07-30.1 at census)', ts_version;
END $$;

-- Entry points first, then helpers, so an interrupted run never leaves a caller pointing at a dropped callee.
DROP FUNCTION IF EXISTS public.gate_a_scan_and_store(uuid);
DROP FUNCTION IF EXISTS public.gate_a_scan(uuid);
DROP FUNCTION IF EXISTS public.gate_a_extract_tokens(text);
DROP FUNCTION IF EXISTS public.gate_a_deadline_tokens(text);
DROP FUNCTION IF EXISTS public.gate_a_figure_tokens(text);
DROP FUNCTION IF EXISTS public.gate_a_derived_covered(uuid);
DROP FUNCTION IF EXISTS public.gate_a_is_citation_line(text);
DROP FUNCTION IF EXISTS public.gate_a_obligation_near(text);
DROP FUNCTION IF EXISTS public.gate_a_contains_token(text, text);
DROP FUNCTION IF EXISTS public.gate_a_collapse_pct(text);
DROP FUNCTION IF EXISTS public.gate_a_norm(text);
DROP FUNCTION IF EXISTS public.gate_a_ws_class();

DROP FUNCTION IF EXISTS public.hrq_enqueue(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.hrq_escalate(uuid, text);
DROP FUNCTION IF EXISTS public.hrq_exit(uuid, text);
DROP FUNCTION IF EXISTS public.hrq_record_attempt(uuid, text, text);

DROP TABLE IF EXISTS public.gate_a_route_b_baseline;

-- Post-drop assertion: the shadow implementation and the broken API are gone, and the LIVE gate-A surface is
-- untouched. A migration that drops the wrong thing must fail here, not in production traffic.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname LIKE 'hrq\_%' OR p.proname IN ('gate_a_scan','gate_a_scan_and_store','gate_a_norm','gate_a_ws_class',
        'gate_a_extract_tokens','gate_a_deadline_tokens','gate_a_figure_tokens','gate_a_derived_covered',
        'gate_a_is_citation_line','gate_a_obligation_near','gate_a_contains_token','gate_a_collapse_pct');
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'POST-DROP ABORT: % shadow/broken function(s) survive', remaining;
  END IF;
  IF to_regclass('public.gate_a_route_b_baseline') IS NOT NULL THEN
    RAISE EXCEPTION 'POST-DROP ABORT: gate_a_route_b_baseline survives';
  END IF;
  IF to_regclass('public.item_gate_a_state') IS NULL OR to_regclass('public.gate_a_health_cache') IS NULL THEN
    RAISE EXCEPTION 'POST-DROP ABORT: a LIVE gate-A object was removed — this migration must never touch item_gate_a_state or gate_a_health_cache';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'gate_a_health') THEN
    RAISE EXCEPTION 'POST-DROP ABORT: gate_a_health() was removed — /api/health/surfaces reads it';
  END IF;
  RAISE NOTICE 'OK: 16 shadow/broken functions + 1 unreferenced baseline table dropped; live gate-A surface intact';
END $$;
