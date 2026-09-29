-- subject: Migration 334 (Lane STRUCTURED-ACTIONS, 2026-09-28): adds intelligence_items.recommended_actions,
-- a jsonb array holding the structured actions extract-recommended-actions.mjs pulls from a brief's "do
-- now" sections. DDL SKETCH ONLY -- AUTHORED, NOT APPLIED (two-track policy, CLAUDE.md standing rule 3).
-- The coordinator applies this via the Supabase CLI, before the dependent record-briefs write-side code
-- (apply-record-briefs.mjs's own "structured-actions" step, already landed this lane in DRY mode) is
-- flipped from report-only to a real guardedUpdateByIds write.
--
-- WHY THIS EXISTS. build-plan-2026-09-25.md workstream 6 / data-machine-tool-gaps-2026-09-25.md's
-- "Produce" row names the destination as "the record-briefs write site extracts structured
-- recommended_actions from prose". A B1 grep of every migration, src/lib/supabase-server.ts, and the
-- record-briefs types (scripts/turns/record-briefs/schema.mjs, src/types/) confirms NO such field
-- exists anywhere in the live schema or the record-briefs contract today: the only `recommended_actions`
-- column in the whole schema lives on the UNRELATED `integrity_flags` table (migration 048), a
-- `{action, rationale}` internal-admin-remediation shape (see B1's own report). This migration is the
-- one named in the coordinator's ruling: add the column, sketch only.
--
-- WHY jsonb, NOT the integrity_flags shape. The extracted shape (docs/specs/07-page-walkthrough.md:56,
-- "a task with an owner and a due date", src/lib/agent/extract-recommended-actions.mjs's own
-- extractRecommendedActions) is { action_text, verb, timeframe_days, owner, due_date, source_section } --
-- owner/due_date/timeframe_days are nullable per-entry facts, not present in integrity_flags'
-- {action, rationale} pair. A jsonb array of objects carries this shape directly, matching the existing
-- convention every other per-item structured-list field on this table already uses (topic_tags,
-- operational_scenario_tags, compliance_object_tags, key_data -- all jsonb/text[] arrays written once per
-- regeneration, never hand-edited). NOT NULL DEFAULT '[]'::jsonb, matching those siblings' own convention
-- of "empty array is the honest absence", never NULL as the resting state.
--
-- CONSUMER IMPACT: NONE EXISTING. Confirmed by the same B1 grep -- zero reads of
-- `intelligence_items.recommended_actions` exist anywhere in src/ or scripts/ today (the field does not
-- exist, so nothing could read it); `src/components/home/DashboardTopPriority.tsx`'s own header comment
-- independently states "no per-item do-now field exists yet; see DESIGN-DEVIATIONS.md", confirming the
-- UI side agrees. This is a purely additive column: no existing query, RPC, or type changes shape, and no
-- existing reader can regress. The two callers this column is FOR (apply-record-briefs.mjs's dry-mode
-- "structured-actions" step, and any future UI surface that renders it) are new code, not migrated code.
--
-- SCOPE (coordinator ruling, 2026-09-28): populated for every brief format whose system prompt names a
-- "do now" section -- regulatory_fact_document (regulation/directive/standard/guidance/framework),
-- technology_profile (technology/innovation/tool), market_signal_brief (market_signal/initiative).
-- operations_profile (regional_data) and research_summary (research_finding) have no such section and
-- structurally extract zero actions (extractRecommendedActions's own DO_NOW_SECTIONS_BY_ITEM_TYPE map);
-- no new shape is invented for them. The column itself is item_type-agnostic (every item_type may carry
-- rows here); the empty case is simply the honest outcome for the two formats with no do-now section.
--
-- RLS: mirrors the table's existing SELECT policy (public read gated on `is_archived`, same posture every
-- other per-item jsonb array column already has -- topic_tags, key_data, etc.); no new policy needed, this
-- is an additive column on an already-RLS-covered table.
--
-- REVERSIBLE: `ALTER TABLE public.intelligence_items DROP COLUMN IF EXISTS recommended_actions;` -- safe,
-- 0 rows populated before this migration applies (the column does not exist yet) and no code reads it
-- until the dependent commit lands per the two-track policy.

BEGIN;

ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.intelligence_items.recommended_actions IS
  'Structured actions extracted from the brief''s "do now" sections (lane STRUCTURED-ACTIONS, '
  '2026-09-28). Array of {action_text, verb, timeframe_days, owner, due_date, source_section}; '
  'owner/due_date/timeframe_days are null when the source prose does not state them (never invented, '
  'CLAUDE.md rule 2). Written by scripts/turns/apply-record-briefs.mjs''s "structured-actions" step via '
  'src/lib/agent/extract-recommended-actions.mjs. Not to be confused with integrity_flags.recommended_'
  'actions (migration 048), an unrelated internal-admin-remediation {action, rationale} shape.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'recommended_actions'
  ) THEN
    RAISE EXCEPTION 'migration 334 self-check failed: intelligence_items.recommended_actions was not created';
  END IF;
END $$;

COMMIT;

-- Rollback: BEGIN; ALTER TABLE public.intelligence_items DROP COLUMN IF EXISTS recommended_actions; COMMIT;
