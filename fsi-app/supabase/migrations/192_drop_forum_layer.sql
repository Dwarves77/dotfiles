-- 192_drop_forum_layer.sql
--
-- Wave-α Track D item d4 (correction-plan D5 ruling; DB-4 register F6, 2026-07-11).
-- AUTHORED-NOT-APPLIED — apply rides the operator DDL window.
--
-- RULING: DROP (dead parallel implementation), per the dispatch decision rule
-- "zero code paths + zero usage = delete via gate". Evidence, re-verified fresh
-- 2026-07-11 in this dispatch (not inherited from the audit):
--   * grep over src/ + scripts/ for forum_sections|forum_threads|forum_replies:
--     ZERO hits. Only references anywhere: migrations 007_community_layer /
--     007_rls_community (the layer's own DDL), a comment line in 075, and
--     supabase/seed/seed-community.sql (the seed INSERTs — removed same commit).
--     (intelligence_items.linked_forum_thread_ids is a plain uuid[] column on
--     intelligence_items echoed through RPC row-types in 073/077/117 — no FK to
--     forum tables, unaffected by this drop.)
--   * Live data: forum_sections 17 rows (all seeded 2026-04-05 by
--     seed-community.sql, thread_count 0 on all 17), forum_threads 0 rows,
--     forum_replies 0 rows.
--   * The shipped Community surface is built entirely on the mig-028+
--     conversation layer (community_groups / community_group_members /
--     community_posts) — the forum_* mig-007 layer is a dead parallel
--     implementation, with embedded vocab fractures (HONG_KONG vs HK;
--     threads_read expects membership_tier values that don't exist in live data).
--
-- Drop order: the one inbound FK first (case_studies.linked_thread_id →
-- forum_threads; column dropped — case_studies itself STAYS, it is d5 scope),
-- then replies → threads → sections (policies/triggers/indexes ride the table
-- drops), then the two now-orphaned trigger functions.
--
-- DATA LOSS (named honestly): the 17 seeded forum_sections rows are erased.
-- They are operator-authored seed content, zero customer exposure (never
-- rendered anywhere), fully reproducible from git history of
-- supabase/seed/seed-community.sql (pre-this-commit revision) — snapshot
-- recorded in docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md.
--
-- Reversible: supabase/rollbacks/192_drop_forum_layer_rollback.sql (recreates
-- schema + RLS + triggers + the case_studies column; seed DATA restores from
-- git history, not from the rollback).

BEGIN;

-- 1) Inbound FK out of the family (case_studies stays; only the dead link goes)
ALTER TABLE public.case_studies DROP COLUMN IF EXISTS linked_thread_id;

-- 2) The three forum tables (children first; RLS policies, triggers, indexes
--    ride the drops)
DROP TABLE IF EXISTS public.forum_replies;
DROP TABLE IF EXISTS public.forum_threads;
DROP TABLE IF EXISTS public.forum_sections;

-- 3) The trigger functions the drops orphaned (mig-007; INVOKER — deliberately
--    NOT flipped by migration 190 because they die here)
DROP FUNCTION IF EXISTS public.update_thread_reply_count();
DROP FUNCTION IF EXISTS public.update_section_thread_count();

COMMIT;
