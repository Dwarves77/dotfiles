-- Migration 180: drop 2 orphan RPCs + 5 zero-consumer views (Wave-α Track E, dead-weight erase e5).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- Numbered 180 to leave 164–179 reserved for Track B's authored-not-applied batch.
-- Rollback: supabase/rollbacks/180_drop_orphan_rpcs_and_dead_views.down.sql (recreates all 7 verbatim).
--
-- Evidence (full-system audit 2026-07-11, re-confirmed fresh this session):
--   * Code: git grep over src/ + scripts/ + .discipline/ — zero consumers for all 7 objects. The
--     lone open_conflicts hit reads the BASE table source_conflicts; the two related_items_derived
--     hits are prose comments (canonical-pipeline.ts:677-678). [X.2(a), X.2(c); CODE-3]
--   * Live catalog (pg_catalog dependency probe, SELECT-only): 0 references across policies,
--     function bodies, view definitions, and trigger bodies for every one of the 7 names.
--   * active_intelligence_items (mig 116) gates NOTHING — the customer gate is the mig-157 RLS
--     policy + the workspace RPC predicates, not this view. [DB-3 §Views corrected by X.2(c)]
--   * get_workspace_members (mig 077): the members UI reads org_memberships via its route; RPC
--     unused. related_items_derived (mig 146): the view was Option A; the fn rode along, no caller.
--
-- Reversibility: all 7 are pure derived objects (no data). The rollback recreates each from its
-- live definition captured 2026-07-11. Views are security_invoker (matching live state).

BEGIN;

DROP VIEW IF EXISTS public.open_conflicts;
DROP VIEW IF EXISTS public.provisional_sources_review;
DROP VIEW IF EXISTS public.source_health_summary;
DROP VIEW IF EXISTS public.active_intelligence_items;
DROP VIEW IF EXISTS public.item_related_items_derived;

DROP FUNCTION IF EXISTS public.get_workspace_members(uuid);
DROP FUNCTION IF EXISTS public.related_items_derived(uuid);

COMMIT;
