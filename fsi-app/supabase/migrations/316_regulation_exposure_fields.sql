-- 316 -- the brief-contract exposure fields task 2.1 requires: cost_mechanism, penalty_range,
-- enforcement_body, requirement_trajectory on intelligence_items, projected through every
-- listing/category-routed customer RPC (lane brieffields, 2026-09-11, W9 brief-chain-build-plan
-- Part 2 task 2.1).
--
-- WHAT THIS ADDS AND WHY. Part 2 of the plan gives the brief contract fields the item detail page
-- is meant to read but no column carries today: who pays (`cost_mechanism`), penalties
-- (`penalty_range`, `enforcement_body`), and the regulation's per-year requirement path
-- (`requirement_trajectory` -- deliberately NOT `trajectory_points`, migration 107's numeric PRICE
-- series with its own CHECK and its own renderer, TrajectoryBars.tsx; this is a qualitative
-- date/value/label step series for `RequirementTrajectory.tsx`, task 2.3). All four are TEXT/JSONB,
-- NULLABLE, no backfill -- task 2.2 (parser + single write site) and task 2.4 (format_type catch-up)
-- populate them organically, honest-empty-until-then, per the platform's standing "no fabricated
-- content" rule.
--
-- SCOPE OF THE RPC EXTENSION -- A DOCUMENTED JUDGMENT CALL, NOT LEFT AMBIGUOUS. The brief's own
-- Interfaces line says "each customer RPC returns the four columns" and directs a read of migrations
-- 107/108/110 for precedent, plus "the current definition of every RPC that feeds the regulation
-- detail and list reads." Two things settle which functions that means, read live via Supabase MCP
-- `pg_get_functiondef` before writing this file (2026-09-11, this lane):
--   (a) The single-item DETAIL read (`fetchIntelligenceItemUncached`, supabase-server.ts:3705,
--       consumed by all FOUR detail routes -- /regulations/[slug], /market/[slug],
--       /operations/[slug], /research/[slug]) is a direct `SELECT "*", source:sources(...)` against
--       `intelligence_items`, not an RPC. It already carries every column the ALTER TABLE below adds,
--       for free, the moment this migration applies -- no RPC touches the detail page's data path.
--       This is exactly why task 2.3 modifies four DETAIL SURFACE components with no matching
--       migration of its own: the wiring is mapper-only on that side.
--   (b) The LIST/ledger-row reads are RPCs, and this codebase already has a live, applied precedent
--       for exactly this question -- migration 310 (`item_grade`, 2026-09-05) added a new
--       customer-facing per-item column and projected it through ELEVEN functions uniformly: the
--       shared helper `_workspace_active_items` and the ten listing/category-routed RPCs (org-scoped
--       + org-independent `_public` sibling, for slim, listings, market, operations, research) --
--       explicitly "kept in parity with its ... siblings rather than left the one exception" (310's
--       own words). That is the established meaning of "every customer RPC" in this codebase for a
--       new item-level column, and it is what "each customer RPC returns the four columns" refers to
--       here. This migration repeats that exact 11-function set.
--   Three functions were checked and deliberately EXCLUDED, on the same evidence migration 310 used
--   to exclude them (confirmed unchanged live, 2026-09-11): `get_workspace_intelligence_dashboard`
--   (migration 064) is a deliberately-stripped card projection that already drops full_brief,
--   operational_impact, open_questions, reasoning, summary, what_is_it, why_matters and key_data --
--   narrative/detail fields exactly like the four this migration adds -- so extending it would break
--   its own minimalism, not fix a gap; `get_workspace_due_next` (315) states its own invariant of
--   staying byte-identical to the dashboard's shape plus one trailing column, so it follows the
--   dashboard's exclusion; `get_technology_items` (no `_public` sibling) was excluded from item_grade
--   by 310 for the same reason it is excluded here -- the five-surface model (Regulations, Market
--   Intel, Research, Operations, Community; PI-1) has no Technology surface, and 310 never brought it
--   into the item_grade parity set either. `get_workspace_intelligence` (the bare, no-suffix
--   fallback) has zero live callers in supabase-server.ts's `fetchWorkspaceResources` today (every
--   call site passes dashboard/listings/slim explicitly) and was likewise outside 310's scope; left
--   alone here for the same reason. `get_workspace_intelligence_aggregates(_scoped)` and
--   `get_workspace_recent_changes` return `jsonb`/a narrow 6-column shape, not an item projection, and
--   were never in the item_grade set either.
--
-- DEPENDENCY SAFETY, RE-VERIFIED FOR THIS LANE (2026-09-11, not just carried over from 310). Six
-- OTHER live functions call `_workspace_active_items(p_org_id)` internally: the ten in-scope RPCs'
-- shared helper is also read by `get_workspace_intelligence_dashboard`, `get_workspace_due_next`,
-- `get_technology_items`, `get_workspace_intelligence_aggregates`,
-- `get_workspace_intelligence_aggregates_scoped`, and `get_workspace_recent_changes` -- i.e. two more
-- dependents than existed when 310 did this same audit (dashboard's caller relationship predates 310;
-- due_next (315) is new since). Read live: every one of the six selects an EXPLICIT column list off
-- the helper's output (never `ii.*` at its own boundary), so widening `_workspace_active_items`'s
-- RETURNS TABLE with trailing columns changes nothing about what they compile to or return --
-- confirmed by reading each of the six bodies directly, not assumed. plpgsql bodies are never
-- dependency-tracked by Postgres either way (310's own note, still true), so the DROP below succeeds
-- regardless.
--
-- CREATE OR REPLACE FUNCTION cannot widen a RETURNS TABLE (ERROR 42P13, migrations 272/310's own
-- documented precedent) -- this file DROPs each of the 11 before recreating it, in the same
-- transaction, then re-GRANTs (DROP does not preserve grants; CREATE FUNCTION grants only PUBLIC by
-- default). Every SELECT list, WHERE clause, JOIN and ORDER BY below is otherwise BYTE-IDENTICAL to
-- the live bodies captured in the pre-check (verified via Supabase MCP execute_sql, read-only,
-- 2026-09-11); this migration adds four trailing columns and changes no routing/filtering logic.
--
-- PRE-CHECK (md5 of the live function bodies this migration replaces -- run again immediately before
-- applying; if any md5 differs, STOP and reconcile against the new live body first, per rule 15
-- "attack, don't assert presence"):
--   SELECT p.proname, md5(pg_get_functiondef(p.oid))
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN (
--      '_workspace_active_items',
--      'get_workspace_intelligence_slim','get_workspace_intelligence_slim_public',
--      'get_workspace_intelligence_listings','get_workspace_intelligence_listings_public',
--      'get_market_intel_items','get_market_intel_items_public',
--      'get_operations_items','get_operations_items_public',
--      'get_research_items','get_research_items_public'
--    ) ORDER BY p.proname;
--   -- Expected (2026-09-11, this lane):
--   -- _workspace_active_items                        9629c86c2dfb13d3a1e338ac12f7b00d
--   -- get_market_intel_items                         9ed7077bdf575e9ad8ddc883b9e3e503
--   -- get_market_intel_items_public                  7221e17225e7269afff81539f8a9bcbe
--   -- get_operations_items                            2778cf34abd689fd2d67348f69e56181
--   -- get_operations_items_public                    43a9708de4cd125ed3b219c12c7ce37e
--   -- get_research_items                              f60a7c4f709e26b660c998712511483d
--   -- get_research_items_public                      7fc1cd705ae0fcd82a5d488d35b8e652
--   -- get_workspace_intelligence_listings             dcd400ca5c420a2f4bea053c6f784c0d
--   -- get_workspace_intelligence_listings_public     2c78febe5653d165cc534140ec83abe9
--   -- get_workspace_intelligence_slim                0277f54c67df587dde6cd843d2f2c928
--   -- get_workspace_intelligence_slim_public         7340389843b719a14a9cf6d2e781399d
--
-- APPLY ORDER: standalone. Does not depend on any other unapplied migration. Per CLAUDE.md rule 3
-- (two-track policy) the coordinator applies this DDL live before task 2.2/2.3's dependent code
-- lands; both fail soft if this is absent (parser writes to columns that don't exist yet fail per-row
-- and get logged, never silently dropped; the mappers in task 2.3 read fields that are simply
-- undefined until the RPC exposes them), so an apply-after does not break any page.
--
-- REVERSIBLE: `ALTER TABLE intelligence_items DROP COLUMN cost_mechanism, DROP COLUMN penalty_range,
-- DROP COLUMN enforcement_body, DROP COLUMN requirement_trajectory;` drops the CHECK with the column;
-- then DROP FUNCTION each of the 11 post-migration signatures and CREATE OR REPLACE FUNCTION each
-- back to its pre-migration body (captured verbatim in the pre-check comment block above), then
-- re-GRANT EXECUTE to anon/authenticated/service_role on each -- the same "DROP first" shape the
-- forward migration uses, since a bare CREATE OR REPLACE back to the shorter RETURNS TABLE hits the
-- identical 42P13.

BEGIN;

-- ── Schema: 4 new columns on intelligence_items ───────────────────────────────────────────────────
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS cost_mechanism        TEXT,
  ADD COLUMN IF NOT EXISTS penalty_range         TEXT,
  ADD COLUMN IF NOT EXISTS enforcement_body      TEXT,
  ADD COLUMN IF NOT EXISTS requirement_trajectory JSONB;

COMMENT ON COLUMN intelligence_items.cost_mechanism IS
  'Who pays and how the cost reaches a forwarder''s invoice (surcharge, levy, allowance cost, '
  'penalty, pass-through). One sentence, verbatim-grounded. Nullable; populated only when the '
  'source states the mechanism (regulatory_fact_document format -- task 2.2). Read by '
  'RegulationDetailSurface''s Who-pays cell.';

COMMENT ON COLUMN intelligence_items.penalty_range IS
  'Verbatim-grounded penalty figure or range from the source''s penalty material (S3/S8). Nullable; '
  'renders in PenaltyFacts alongside enforcement_body when either is present.';

COMMENT ON COLUMN intelligence_items.enforcement_body IS
  'Verbatim-grounded name of the body that enforces the instrument, from the source''s penalty '
  'material. Nullable; renders in PenaltyFacts alongside penalty_range when either is present.';

COMMENT ON COLUMN intelligence_items.requirement_trajectory IS
  'The regulation''s per-year requirement path (deliberately NOT trajectory_points, migration 107''s '
  'numeric price series -- a different shape, a different renderer). JSONB shape: '
  '{ "steps": [{"date": "2025" | "2026-09-30" | "2027", "value": "40%", "label": "of verified '
  'emissions"}, ...], "note": "free text, e.g. scope changes across steps" }. Nullable; null when '
  'the instrument has no phase-in. Constrained to steps being a JSON array (when present) via '
  'intelligence_items_requirement_trajectory_check. Read by RequirementTrajectory.tsx (task 2.3).';

-- ── CHECK: requirement_trajectory.steps must be a JSON array when the column is non-null ─────────
ALTER TABLE intelligence_items
  DROP CONSTRAINT IF EXISTS intelligence_items_requirement_trajectory_check;

ALTER TABLE intelligence_items
  ADD CONSTRAINT intelligence_items_requirement_trajectory_check
  CHECK (requirement_trajectory IS NULL OR (jsonb_typeof(requirement_trajectory->'steps') = 'array'));

-- ── RPC exposure: 4 new trailing columns on 11 functions ──────────────────────────────────────────
-- DROP order: dependents-of-`_workspace_active_items` first, for readability only (Postgres does not
-- require it -- see the dependency-safety note above).

DROP FUNCTION IF EXISTS public.get_workspace_intelligence_listings(uuid, integer);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_listings_public(integer, text, date, uuid);
DROP FUNCTION IF EXISTS public.get_operations_items(uuid);
DROP FUNCTION IF EXISTS public.get_operations_items_public();
DROP FUNCTION IF EXISTS public.get_research_items(uuid);
DROP FUNCTION IF EXISTS public.get_research_items_public();
DROP FUNCTION IF EXISTS public._workspace_active_items(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_slim(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_slim_public();
DROP FUNCTION IF EXISTS public.get_market_intel_items(uuid);
DROP FUNCTION IF EXISTS public.get_market_intel_items_public();

-- 1. _workspace_active_items(p_org_id) -- shared org-scoped base for get_workspace_intelligence_
--    listings / get_operations_items / get_research_items (and, outside this migration's scope,
--    the dashboard/due_next/technology/aggregates/recent_changes callers verified safe above).
CREATE OR REPLACE FUNCTION public._workspace_active_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, archive_reason text, archive_note text, archived_date date, replaced_by uuid, version_history jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, linked_forum_thread_ids uuid[], linked_vendor_ids uuid[], linked_case_study_ids uuid[], linked_regulation_ids uuid[], region_tags text[], topic_tags text[], vertical_tags text[], full_brief text, urgency_tier text, format_type text, last_regenerated_at timestamp with time zone, regeneration_skill_version text, sources_used uuid[], operational_scenario_tags text[], compliance_object_tags text[], related_items uuid[], intersection_summary text, jurisdiction_iso text[], agent_integrity_flag boolean, agent_integrity_phrase text, agent_integrity_flagged_at timestamp with time zone, agent_integrity_resolved_at timestamp with time zone, agent_integrity_resolved_by uuid, pipeline_stage text, hidden_reason text, effective_priority text, effective_archived boolean, item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
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
    ii.linked_forum_thread_ids, ii.linked_vendor_ids, ii.linked_case_study_ids,
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
    AND ii.provenance_status = 'verified';   -- Sprint 4 task 1.10: customer read gate
END;
$function$;

-- 2. get_workspace_intelligence_slim(p_org_id) -- Regulations/Market/Operations first-paint (org-scoped).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo ON wo.item_id = ii.id AND wo.org_id = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 3. get_workspace_intelligence_slim_public() -- org-independent counterpart (migration 306).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 4. get_workspace_intelligence_listings(p_org_id, p_domain) -- Regulations' authenticated listings
--    path; sources FROM _workspace_active_items, so the four columns are already present on `ii`
--    once (1) above applies.
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid, p_domain integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public._workspace_active_items(p_org_id) ii
  WHERE (p_domain IS NULL OR ii.domain = p_domain)
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 5. get_workspace_intelligence_listings_public(...) -- org-independent counterpart (migration 306),
--    including the keyset-cursor triple (PERF-12-MERGE). Reads intelligence_items directly (not via
--    the helper), so the four columns are added straight off `ii`.
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings_public(
  p_domain integer DEFAULT NULL::integer,
  p_after_priority text DEFAULT NULL::text,
  p_after_added_date date DEFAULT NULL::date,
  p_after_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_after_rank int;
BEGIN
  v_after_rank := CASE
    WHEN p_after_priority IS NULL THEN NULL
    ELSE (CASE p_after_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END)
  END;
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND (p_domain IS NULL OR ii.domain = p_domain)
    AND (
      p_after_id IS NULL
      OR (
        (CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) > v_after_rank
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date < p_after_added_date)
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date = p_after_added_date AND ii.id > p_after_id)
      )
    )
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 6. get_market_intel_items(p_org_id) -- Market ledger (org-scoped).
CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  LEFT JOIN public.workspace_item_overrides wo ON wo.item_id = ii.id AND wo.org_id = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 7. get_market_intel_items_public() -- org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_market_intel_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 8. get_operations_items(p_org_id) -- Operations ledger (org-scoped); sources FROM
--    _workspace_active_items, so the four columns flow through once (1) applies.
CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 9. get_operations_items_public() -- org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_operations_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 10. get_research_items(p_org_id) -- Research ledger (org-scoped); sources FROM
--     _workspace_active_items, so the four columns flow through once (1) applies. what_it_changes /
--     does_not_resolve keep reading off the separately-joined `src` (they were never added to
--     _workspace_active_items's own RETURNS TABLE by migration 110) -- unchanged by this migration.
CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    src.what_it_changes, src.does_not_resolve,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- 11. get_research_items_public() -- org-independent counterpart.
CREATE OR REPLACE FUNCTION public.get_research_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[], item_grade text, cost_mechanism text, penalty_range text, enforcement_body text, requirement_trajectory jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.what_it_changes, ii.does_not_resolve,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso,
    ii.item_grade,
    ii.cost_mechanism, ii.penalty_range, ii.enforcement_body, ii.requirement_trajectory
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- Grants are NOT preserved by DROP FUNCTION -- CREATE FUNCTION grants only PUBLIC (`=X/postgres`) by
-- default, so the three named roles the live ACL carries (anon, authenticated, service_role) are
-- re-granted explicitly on all 11 (migration 310's own precedent for this exact shape).
GRANT EXECUTE ON FUNCTION public._workspace_active_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_slim(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_slim_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_listings(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_listings_public(integer, text, date, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_market_intel_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_market_intel_items_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_items_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_research_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_research_items_public() TO anon, authenticated, service_role;

-- ── Post-check (idempotent -- safe to re-run) ─────────────────────────────────────────────────────
DO $$
DECLARE
  n_present      int;
  n_slim         int;
  n_listings     int;
  v_probe_id     uuid;
  v_ok           boolean;
BEGIN
  -- 1. Presence: every RETURNS TABLE must now list all four new columns.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           '_workspace_active_items','get_workspace_intelligence_slim','get_workspace_intelligence_slim_public',
           'get_workspace_intelligence_listings','get_workspace_intelligence_listings_public',
           'get_market_intel_items','get_market_intel_items_public',
           'get_operations_items','get_operations_items_public',
           'get_research_items','get_research_items_public'
         )
         AND pg_get_functiondef(p.oid) ILIKE '%cost_mechanism%'
         AND pg_get_functiondef(p.oid) ILIKE '%penalty_range%'
         AND pg_get_functiondef(p.oid) ILIKE '%enforcement_body%'
         AND pg_get_functiondef(p.oid) ILIKE '%requirement_trajectory%') <> 11 THEN
    RAISE EXCEPTION 'ABORT: not all 11 functions project all four new columns after CREATE OR REPLACE';
  END IF;

  -- 2. Execution, not just presence (rule 15): call the org-independent five with zero arguments and
  -- confirm no error is raised and the new columns are selectable (would raise 42703 if mis-typed).
  PERFORM count(*) FILTER (WHERE cost_mechanism IS NOT NULL OR penalty_range IS NOT NULL
                              OR enforcement_body IS NOT NULL OR requirement_trajectory IS NOT NULL)
    FROM public.get_workspace_intelligence_slim_public();
  PERFORM count(*) FILTER (WHERE cost_mechanism IS NOT NULL OR penalty_range IS NOT NULL
                              OR enforcement_body IS NOT NULL OR requirement_trajectory IS NOT NULL)
    FROM public.get_workspace_intelligence_listings_public();
  PERFORM count(*) FILTER (WHERE cost_mechanism IS NOT NULL OR penalty_range IS NOT NULL
                              OR enforcement_body IS NOT NULL OR requirement_trajectory IS NOT NULL)
    FROM public.get_market_intel_items_public();
  PERFORM count(*) FILTER (WHERE cost_mechanism IS NOT NULL OR penalty_range IS NOT NULL
                              OR enforcement_body IS NOT NULL OR requirement_trajectory IS NOT NULL)
    FROM public.get_operations_items_public();
  PERFORM count(*) FILTER (WHERE cost_mechanism IS NOT NULL OR penalty_range IS NOT NULL
                              OR enforcement_body IS NOT NULL OR requirement_trajectory IS NOT NULL)
    FROM public.get_research_items_public();

  -- 3. Slim/listings must still agree in total row count with each other (same base predicate, per
  -- migration 306/310's own post-check) -- the new columns must not have changed that invariant.
  SELECT count(*) INTO n_slim FROM public.get_workspace_intelligence_slim_public();
  SELECT count(*) INTO n_listings FROM public.get_workspace_intelligence_listings_public();
  IF n_slim <> n_listings THEN
    RAISE EXCEPTION 'ABORT: slim_public (%) and listings_public (%) row counts disagree after adding the four columns -- same base predicate, must match', n_slim, n_listings;
  END IF;

  -- 4. Attack, don't assert presence (rule 15): the CHECK constraint must reject a non-array `steps`
  -- and accept both NULL and a valid array, proven against a real row via SAVEPOINT/ROLLBACK (no
  -- permanent change). Requires at least one live row; self-skips (RAISE NOTICE) if the table is
  -- somehow empty rather than failing the whole migration on an environment precondition.
  SELECT id INTO v_probe_id FROM public.intelligence_items LIMIT 1;
  IF v_probe_id IS NULL THEN
    RAISE NOTICE 'SKIP: no intelligence_items row available to adversarially probe the CHECK constraint';
  ELSE
    BEGIN
      SAVEPOINT check_probe_reject;
      UPDATE public.intelligence_items
        SET requirement_trajectory = '{"steps":"not-an-array"}'::jsonb
        WHERE id = v_probe_id;
      RAISE EXCEPTION 'ABORT: intelligence_items_requirement_trajectory_check did not reject a non-array steps value';
    EXCEPTION WHEN check_violation THEN
      ROLLBACK TO SAVEPOINT check_probe_reject;
    END;

    BEGIN
      SAVEPOINT check_probe_accept;
      UPDATE public.intelligence_items
        SET requirement_trajectory = '{"steps":[{"date":"2025","value":"40%","label":"of verified emissions"}],"note":"probe"}'::jsonb
        WHERE id = v_probe_id;
      ROLLBACK TO SAVEPOINT check_probe_accept;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'ABORT: intelligence_items_requirement_trajectory_check rejected a VALID array-shaped steps value';
    END;

    BEGIN
      SAVEPOINT check_probe_null;
      UPDATE public.intelligence_items SET requirement_trajectory = NULL WHERE id = v_probe_id;
      ROLLBACK TO SAVEPOINT check_probe_null;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'ABORT: intelligence_items_requirement_trajectory_check rejected NULL';
    END;
  END IF;
END $$;

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema' so PostgREST picks up the new columns/return shapes.
