-- subject: Migration 334 (Lane DROP-PLACEHOLDERS, 2026-09-29). AUTHOR-ONLY, NOT APPLIED, rides
-- coordinator/operator DDL approval. RULING (verbatim, 2026-09-29): "There has never been anyone in
-- community so my guess is they are fake place holders. Remove them completely and ease them" [erase].
--
-- Scope: case_studies (6 rows, all seeded 2026-04-05 by supabase/seed/seed-community.sql, see
-- session-log evidence), case_study_endorsements (0 rows), taxonomy_nodes (38 rows, same seed file),
-- plus everything that exists only to serve them:
--   * case_study_endorsements -> case_studies FK (child table, dropped first)
--   * the case_studies_updated_at / case_study_validation_count_trigger triggers (ride the table
--     drops) and the now-orphaned update_case_study_validation_count() trigger function
--   * intelligence_items.linked_case_study_ids (plain uuid[] column, always empty in production,
--     0 rows with non-empty values, verified live) and its one live reader,
--     public._workspace_active_items(), whose RETURNS TABLE signature and SELECT list are updated
--     in place (DROP + CREATE, not CREATE OR REPLACE, since the column list shrinks). Its nine
--     downstream wrapper RPCs (get_workspace_intelligence_listings, get_workspace_intelligence_
--     dashboard, get_operations_items, get_research_items, get_technology_items,
--     get_workspace_due_next, get_workspace_intelligence_aggregates[_scoped],
--     get_workspace_recent_changes) each name their own explicit column list when calling
--     _workspace_active_items(...); none select linked_case_study_ids or `wai.*`, so none require
--     a change (verified live via pg_get_functiondef, 2026-09-29).
--
-- NOT in scope, already gone: the forum_threads.thread_type 'case_study_link' enum option. The
-- entire forum_* layer (forum_sections, forum_threads, forum_replies) plus case_studies.
-- linked_thread_id were already dropped by migration 192 (2026-07-11, Wave-alpha Track D d4).
-- Verified live 2026-09-29: forum_threads/forum_sections/forum_replies do not exist;
-- case_studies has no linked_thread_id column. Zero live usage of 'case_study_link' anywhere;
-- no action needed here.
--
-- Not touched (out of scope, separate table families, verified live no dependency on the three
-- dropped tables): vendors/vendor_technologies/vendor_regulations/vendor_endorsements (already
-- dropped by migration 181; vendor_technologies was the only other FK consumer of taxonomy_nodes
-- and no longer exists), community_thread_entities.entity_kind (enum has no case_study value;
-- entity_id FKs to `entities`, not case_studies).
--
-- Evidence (full detail): docs/ops/session-log.d/2026-09-29-drop-placeholders.md
-- Snapshot of erased rows: fsi-app/scripts/tmp/drop-placeholders-2026-09-29/*.json (gitignored,
-- not committed; reproducible from git history of supabase/seed/seed-community.sql).
-- Reversible: recreate the DDL from git history of this file's parent commit, then re-run
-- seed-community.sql's pre-this-commit revision for the seed DATA (no rollback file authored;
-- this drop returns fabricated placeholder rows to zero, not real customer data).

BEGIN;

-- 1) Child table first (FK -> case_studies, ON DELETE CASCADE already, but be explicit and drop
--    child before parent for clarity).
DROP TABLE IF EXISTS public.case_study_endorsements;

-- 2) case_studies itself.
DROP TABLE IF EXISTS public.case_studies;

-- 3) taxonomy_nodes (self-referencing parent_id FK only; no other live table FKs into it since
--    migration 181 dropped vendor_technologies, its only other consumer).
DROP TABLE IF EXISTS public.taxonomy_nodes;

-- 4) The orphaned case_study_endorsements trigger function (case_studies_updated_at's function,
--    update_updated_at(), is shared across many tables and stays).
DROP FUNCTION IF EXISTS public.update_case_study_validation_count();

-- 5) Redefine the one live reader of linked_case_study_ids before dropping the column: the
--    RETURNS TABLE column list is shrinking, so this must be DROP + CREATE, not CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public._workspace_active_items(uuid);

CREATE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, archive_reason text, archive_note text, archived_date date, replaced_by uuid, version_history jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, linked_forum_thread_ids uuid[], linked_vendor_ids uuid[], linked_regulation_ids uuid[], region_tags text[], topic_tags text[], vertical_tags text[], full_brief text, urgency_tier text, format_type text, last_regenerated_at timestamp with time zone, regeneration_skill_version text, sources_used uuid[], operational_scenario_tags text[], compliance_object_tags text[], related_items uuid[], intersection_summary text, jurisdiction_iso text[], agent_integrity_flag boolean, agent_integrity_phrase text, agent_integrity_flagged_at timestamp with time zone, agent_integrity_resolved_at timestamp with time zone, agent_integrity_resolved_by uuid, pipeline_stage text, hidden_reason text, effective_priority text, effective_archived boolean, item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
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
    ii.linked_forum_thread_ids, ii.linked_vendor_ids,
    ii.linked_regulation_ids, ii.region_tags, ii.topic_tags, ii.vertical_tags,
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

-- 6) Now the column itself (0 non-empty rows, verified live 2026-09-29).
ALTER TABLE public.intelligence_items DROP COLUMN IF EXISTS linked_case_study_ids;

-- ── Post-check: assert every dropped object is actually gone ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('case_studies','case_study_endorsements','taxonomy_nodes')) THEN
    RAISE EXCEPTION 'migration 334 post-check failed: a target table still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='intelligence_items' AND column_name='linked_case_study_ids') THEN
    RAISE EXCEPTION 'migration 334 post-check failed: intelligence_items.linked_case_study_ids still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_case_study_validation_count' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'migration 334 post-check failed: update_case_study_validation_count() still exists';
  END IF;
END $$;

COMMIT;
