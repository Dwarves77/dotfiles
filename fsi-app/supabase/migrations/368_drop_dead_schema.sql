-- subject: Migration 368 (lane DEAD-2, 2026-10-08, DATA-DELETING: operator review required): drops the DEAD class of dead-code census categories 5 and 6, which is one view (acquisition_backlog_v) and ten columns (intelligence_items.linked_forum_thread_ids, linked_vendor_ids, linked_regulation_ids, region_tags; sources.last_scanned, last_content_fetched_at, last_intelligence_item_at, api_endpoint_url, api_auth_method, api_response_format), after redefining the one function that returns the four intelligence_items columns (_workspace_active_items, migration 335's definition minus those four); every other census object is classified OWED, HISTORY, UNSURE or LIVE and is not touched; NOT APPLIED.
-- 368 -- drop dead schema (lane DEAD-2, 2026-10-08).
--
-- NOT APPLIED. DATA-DELETING: operator review required. The drops below are reversible in intent only (the
-- DDL of every dropped object is in the migrations named per line; a column's values are not recoverable
-- once dropped). The operator rules on this drop list before the coordinator's executor applies the file.
-- Authored by lane DEAD-2 with no database access: every claim below is a repo-side grep result, labelled
-- as such. The classification table for all 45 census items (22 in category 5, 23 in category 6) is
-- fsi-app/scripts/tmp/dead2-schema-classification-2026-10-08.md (gitignored; the coordinator lands it under
-- docs/audits with rule-14 tokens). Source of the 45: fsi-app/scripts/tmp/dead-code-census-2026-10-08.md,
-- sections 5 and 6.
--
-- CLASSIFICATION RULE. DEAD = no reader, no writer and no spec owner anywhere in src, scripts, supabase
-- (functions, policies, triggers, views, seed scripts), .github, docs/runbooks (including the scheduled
-- fleet charters) and docs/specs. A pass-through column in a RETURNS TABLE list that no caller names counts
-- as no reader (migration 335 treated linked_case_study_ids the same way). OWED = a spec, ADR or runbook
-- names a producer or consumer; HISTORY = written, never read, rows kept; UNSURE = a named ambiguity; LIVE =
-- the census was refuted (a reader exists). Counts: DEAD 11, OWED 13, HISTORY 12, UNSURE 4, LIVE 5.
--
-- rows at review time: (read-only SELECTs; the coordinator's executor fills each <FILL> before the operator
-- sees this file; nothing here is a claim until filled)
--   The view holds no rows of its own; its base table coverage_gap_candidates is untouched.
--   SELECT count(*) FROM public.coverage_gap_candidates;                       -- <FILL>
--   SELECT count(*) FROM public.acquisition_backlog_v;                         -- rows the dropped view returns: <FILL>
--   SELECT count(*) FROM public.intelligence_items;                            -- total rows: <FILL>
--   SELECT count(*) FROM public.intelligence_items WHERE cardinality(linked_forum_thread_ids) > 0;  -- non-empty: <FILL> (the migration aborts unless 0)
--   SELECT count(*) FROM public.intelligence_items WHERE cardinality(linked_vendor_ids) > 0;        -- non-empty: <FILL> (the migration aborts unless 0)
--   SELECT count(*) FROM public.intelligence_items WHERE cardinality(linked_regulation_ids) > 0;    -- non-empty: <FILL> (the migration aborts unless 0)
--   SELECT count(*) FROM public.intelligence_items WHERE cardinality(region_tags) > 0;              -- non-empty: <FILL> (the migration aborts unless 0)
--   SELECT count(*) FROM public.sources;                                       -- total rows: <FILL>
--   SELECT count(last_scanned) FROM public.sources;                            -- non-null: <FILL>
--   SELECT count(last_content_fetched_at) FROM public.sources;                 -- non-null: <FILL>
--   SELECT count(last_intelligence_item_at) FROM public.sources;               -- non-null: <FILL>
--   SELECT count(api_endpoint_url) FROM public.sources;                        -- non-null: <FILL>
--   SELECT count(api_auth_method) FROM public.sources;                         -- non-null: <FILL>
--   SELECT count(api_response_format) FROM public.sources;                     -- non-null: <FILL>
--   Operator note: a non-zero count on a sources column is data that disappears with the column. Strike that
--   column from the ALTER TABLE statement below (and from the test's expected set) if the data is wanted.
--
-- WHAT GOES, WITH THE EVIDENCE (grep over src, scripts, supabase, .github, docs; [CONFIRMED] by reading):
--   EVIDENCE acquisition_backlog_v: census category 5b row 2. Created by migration 223 (retroactive byte-matching copy of a live-only view). Zero mentions in src, scripts (non-test), .github, docs/runbooks, docs/specs, fleet charters; the only other mentions are migration 273 comments, the schema-drift fixture strings in scripts/verify tests, and the applied-migrations ledger. No function, trigger or policy reads it. A view: no rows are lost; the CREATE is in migration 223.
--   EVIDENCE intelligence_items.linked_forum_thread_ids: census category 6 row 5. Added by migration 007 for the forum layer, dropped by migration 192. The only SQL reader is the pass-through column list of _workspace_active_items (migrations 310, 316, 335); no wrapper RPC names it (migration 335 verified the wrappers use explicit lists). Zero hits in src and scripts (the only one is a column-name fixture set in src/app/api/search/route.npmtest.mjs).
--   EVIDENCE intelligence_items.linked_vendor_ids: census category 6 row 6. Added by migration 007; the vendor family was dropped by migration 181. Same reader situation as linked_forum_thread_ids.
--   EVIDENCE intelligence_items.linked_regulation_ids: census category 6 row 7. Added by migration 007 for the community layer, retired by migrations 192, 335 and ADR-041. Same reader situation as linked_forum_thread_ids.
--   EVIDENCE intelligence_items.region_tags: census category 6 row 8. Added by migration 007 (with GIN index idx_items_region_tags, which drops with the column). Same reader situation as linked_forum_thread_ids; no src reader of region_tags exists.
--   EVIDENCE sources.last_scanned: census category 6 row 13. Added by migration 051 as the agent/run cooldown; the cooldown now reads agent_runs per item (fsi-app/.claude/CLAUDE.md, permitted-calls table). No code, function, trigger or view reads or writes it; mentions are the 2026-05 post-mortem prose and a superseded design plan (docs/plans/registry-to-ingestion-handoff-design-2026-05-10.md, whose drain worker was dissolved 2026-07-12).
--   EVIDENCE sources.last_content_fetched_at: census category 6 row 14. Added by migration 054 (scoreboard column, with an index that drops with the column). Zero references anywhere outside migration 054.
--   EVIDENCE sources.last_intelligence_item_at: census category 6 row 15. Added by migration 054. Zero references outside migration 054, a comment in migration 063 and the same superseded design plan.
--   EVIDENCE sources.api_endpoint_url: census category 6 row 16. Added by migration 056 for an api-fetch helper that was never built as such (the per-host ladder in src/lib/sources/api-transport.mjs reads no column). Zero references outside migration 056.
--   EVIDENCE sources.api_auth_method: census category 6 row 17. Migration 056, with CHECK constraint sources_api_auth_method_check (drops with the column). Zero references outside migration 056; the only other mention is the generated docs/inventories/db-check-constraints.json (regenerated from the live database after apply).
--   EVIDENCE sources.api_response_format: census category 6 row 18. Migration 056, with CHECK constraint sources_api_response_format_check (drops with the column). Same as api_auth_method.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH (35 of the 45; the reasons are in the classification file):
--   OWED (spec, ADR or runbook names it): intelligence_summaries, statutory_computations,
--     sensitive_field_policy, aggregate_query_log (ADR-042 keeps the last two by name),
--     census_rollup_by_surface, propagation_queue_depth, derived_values_admissible, licence_clear_sources,
--     emission_factor_candidates; columns census_worklist.resolved_into_id (fleet charter
--     authorship-worker.md reads it), sources.observed_correctness_count, sources.classification_confidence,
--     sources.classification_rationale.
--   HISTORY (written, never read; rows kept): bulk_imports, intelligence_item_versions,
--     system_state_flag_audit, disposition_ledger, coverage_gap_census_findings, corpus_census; columns
--     source_bias_tags.assigned_at, propagation_events.txid, intelligence_items.hidden_reason,
--     intelligence_items.provenance_verified_at, sources.classification_assigned_at, obligations.derived_at.
--   UNSURE (a named ambiguity, needs a ruling or DEAD-1 first): estimated_values, community_topics,
--     community_topic_groups, section_claim_provenance.verified_by.
--   LIVE (the census was refuted): mutation_leases, data_sources, sector_contexts, intelligence_items.search_tsv,
--     sources.spotchecked.
--
-- THE ONE FUNCTION REDEFINED. public._workspace_active_items(uuid) returns the four intelligence_items
-- columns by name, so its RETURNS TABLE list shrinks: DROP + CREATE, not CREATE OR REPLACE (the same method as
-- migration 335). The new body is migration 335's text with exactly the four names removed from the
-- signature and the select list; the static test derives the expected text from 335 and compares byte for
-- byte. DROP FUNCTION resets the ACL, so the live grant set (anon, authenticated, service_role EXECUTE) is
-- restored and asserted. The wrapper RPCs that call it each name their own explicit columns (migration 335
-- verified this live, and a grep of every migration confirms only the helper's own definitions name the four).
-- Executor check before applying: diff pg_get_functiondef('public._workspace_active_items(uuid)'::regprocedure)
-- against migration 335's body; the pre-check below also aborts if the live return type does not carry the
-- four columns.
--
-- ORDER OF APPLICATION. Schema DDL applies via the Supabase CLI before the dependent code commits (CLAUDE.md
-- standing rule 3). No code in src or scripts reads any dropped object (the greps above), so this migration
-- can apply before or after any code PR. Follow-ups outside this lane's write set (recorded in the session
-- log): src/app/api/search/route.npmtest.mjs lists the four intelligence_items columns in its
-- LIVE_INTELLIGENCE_ITEMS_COLUMNS fixture set, docs/inventories/db-check-constraints.json is regenerated from
-- the live database by the maintenance workflow, and .discipline/governance/db-catalog.json still lists
-- acquisition_backlog_v until its next refresh (F24 accepts a DROP as the migration home).
--
-- Plain DROP (RESTRICT) on purpose: an unexpected dependent object makes the statement fail loudly and the
-- transaction roll back, instead of CASCADE silently removing it.

BEGIN;

-- Pre-check: the four array columns must be empty on every row (migration 335's evidence standard), and the
-- live helper must still return them (so this redefinition replaces the version this file was written from).
DO $$
DECLARE
  c text;
  n bigint;
  fn_result text;
BEGIN
  FOREACH c IN ARRAY ARRAY['linked_forum_thread_ids', 'linked_vendor_ids', 'linked_regulation_ids', 'region_tags'] LOOP
    EXECUTE format('SELECT count(*) FROM public.intelligence_items WHERE cardinality(%I) > 0', c) INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION 'ABORT: public.intelligence_items.% holds % non-empty row(s); it is not dead', c, n;
    END IF;
  END LOOP;

  SELECT pg_get_function_result('public._workspace_active_items(uuid)'::regprocedure) INTO fn_result;
  FOREACH c IN ARRAY ARRAY['linked_forum_thread_ids', 'linked_vendor_ids', 'linked_regulation_ids', 'region_tags'] LOOP
    IF position(c || ' ' IN fn_result) = 0 THEN
      RAISE EXCEPTION 'ABORT: live _workspace_active_items no longer returns %; re-derive this migration from the live definition', c;
    END IF;
  END LOOP;
END $$;

-- 1) The view (census category 5b row 2). No rows are lost.
DROP VIEW IF EXISTS public.acquisition_backlog_v;

-- 2) Redefine the helper without the four columns (DROP + CREATE, the RETURNS TABLE list shrinks).
DROP FUNCTION IF EXISTS public._workspace_active_items(uuid);

CREATE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, archive_reason text, archive_note text, archived_date date, replaced_by uuid, version_history jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, topic_tags text[], vertical_tags text[], full_brief text, urgency_tier text, format_type text, last_regenerated_at timestamp with time zone, regeneration_skill_version text, sources_used uuid[], operational_scenario_tags text[], compliance_object_tags text[], related_items uuid[], intersection_summary text, jurisdiction_iso text[], agent_integrity_flag boolean, agent_integrity_phrase text, agent_integrity_flagged_at timestamp with time zone, agent_integrity_resolved_at timestamp with time zone, agent_integrity_resolved_by uuid, pipeline_stage text, hidden_reason text, effective_priority text, effective_archived boolean, item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.operational_impact, ii.open_questions, ii.tags, ii.domain,
    ii.category, ii.item_type, ii.source_id, ii.source_url, ii.jurisdictions,
    ii.transport_modes, ii.verticals, ii.status, ii.severity, ii.confidence,
    ii.priority, ii.reasoning, ii.entry_into_force, ii.compliance_deadline,
    ii.next_review_date, ii.added_date, ii.last_verified, ii.is_archived,
    ii.archive_reason, ii.archive_note, ii.archived_date, ii.replaced_by,
    ii.version_history, ii.created_at, ii.updated_at,
    ii.topic_tags, ii.vertical_tags,
    ii.full_brief, ii.urgency_tier, ii.format_type, ii.last_regenerated_at,
    ii.regeneration_skill_version, ii.sources_used,
    ii.operational_scenario_tags, ii.compliance_object_tags,
    ii.related_items, ii.intersection_summary, ii.jurisdiction_iso,
    ii.agent_integrity_flag, ii.agent_integrity_phrase,
    ii.agent_integrity_flagged_at, ii.agent_integrity_resolved_at,
    ii.agent_integrity_resolved_by, ii.pipeline_stage, ii.hidden_reason,
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified';   -- Sprint 4 task 1.10: customer read gate (ADDED)
END;
$function$;

-- DROP FUNCTION reset the ACL to owner-only; restore the live grant set (as migration 335 did).
GRANT EXECUTE ON FUNCTION public._workspace_active_items(uuid) TO anon, authenticated, service_role;

-- 3) The columns (census category 6). Single-column CHECK constraints and indexes drop with their column.
ALTER TABLE public.intelligence_items
  DROP COLUMN IF EXISTS linked_forum_thread_ids,
  DROP COLUMN IF EXISTS linked_vendor_ids,
  DROP COLUMN IF EXISTS linked_regulation_ids,
  DROP COLUMN IF EXISTS region_tags;

ALTER TABLE public.sources
  DROP COLUMN IF EXISTS last_scanned,
  DROP COLUMN IF EXISTS last_content_fetched_at,
  DROP COLUMN IF EXISTS last_intelligence_item_at,
  DROP COLUMN IF EXISTS api_endpoint_url,
  DROP COLUMN IF EXISTS api_auth_method,
  DROP COLUMN IF EXISTS api_response_format;

-- Post-check: every dropped object is gone, every neighbour that must stay is present, the helper works.
DO $$
DECLARE
  c text;
  r text;
  fn_result text;
BEGIN
  IF to_regclass('public.acquisition_backlog_v') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: view acquisition_backlog_v still exists after DROP VIEW';
  END IF;

  FOREACH c IN ARRAY ARRAY['linked_forum_thread_ids', 'linked_vendor_ids', 'linked_regulation_ids', 'region_tags'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = c) THEN
      RAISE EXCEPTION 'ABORT: intelligence_items.% still exists', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['last_scanned', 'last_content_fetched_at', 'last_intelligence_item_at', 'api_endpoint_url', 'api_auth_method', 'api_response_format'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = c) THEN
      RAISE EXCEPTION 'ABORT: sources.% still exists', c;
    END IF;
  END LOOP;

  -- Kept neighbours: the base table of the dropped view, the live columns the census refuted, the HISTORY
  -- column on the same table, and the sibling view that has a doc owner.
  IF to_regclass('public.coverage_gap_candidates') IS NULL THEN
    RAISE EXCEPTION 'ABORT: coverage_gap_candidates is gone, but migration 368 must keep it';
  END IF;
  IF to_regclass('public.census_rollup_by_surface') IS NULL THEN
    RAISE EXCEPTION 'ABORT: census_rollup_by_surface is gone, but migration 368 must keep it';
  END IF;
  FOREACH c IN ARRAY ARRAY['search_tsv', 'hidden_reason', 'provenance_verified_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = c) THEN
      RAISE EXCEPTION 'ABORT: intelligence_items.% is gone, but migration 368 must keep it', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['spotchecked', 'classification_confidence', 'classification_rationale', 'classification_assigned_at', 'observed_correctness_count'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = c) THEN
      RAISE EXCEPTION 'ABORT: sources.% is gone, but migration 368 must keep it', c;
    END IF;
  END LOOP;

  -- The recreated helper: grants restored, the four columns gone from its return type, the rest intact.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT has_function_privilege(r, 'public._workspace_active_items(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'ABORT: % lacks EXECUTE on _workspace_active_items', r;
    END IF;
  END LOOP;
  SELECT pg_get_function_result('public._workspace_active_items(uuid)'::regprocedure) INTO fn_result;
  FOREACH c IN ARRAY ARRAY['linked_forum_thread_ids', 'linked_vendor_ids', 'linked_regulation_ids', 'region_tags'] LOOP
    IF position(c || ' ' IN fn_result) <> 0 THEN
      RAISE EXCEPTION 'ABORT: _workspace_active_items still returns %', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['hidden_reason', 'item_grade', 'requirement_trajectory', 'effective_priority'] LOOP
    IF position(c || ' ' IN fn_result) = 0 THEN
      RAISE EXCEPTION 'ABORT: _workspace_active_items lost %, which migration 368 must keep', c;
    END IF;
  END LOOP;

  RAISE NOTICE 'migration 368 OK: view acquisition_backlog_v and 10 columns dropped (intelligence_items x4, sources x6); _workspace_active_items redefined without the four intelligence_items columns; kept neighbours present';
END $$;

COMMIT;
