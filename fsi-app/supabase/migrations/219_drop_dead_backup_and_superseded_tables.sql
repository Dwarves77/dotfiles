-- Migration 219 — structure-audit cleanup (operator ruling 2026-07-19 "Do it").
-- Source: docs/audits/supabase-structure-audit-2026-07-19.md (full-schema producer/consumer + intent audit).
--
-- Drops, tombstone-then-delete (each row count logged pre-drop; a table that GREW since audit aborts):
--   (a) The 6 backup / one-shot tables with ZERO code references anywhere:
--       intelligence_items_pre_phase5 (655), pending_jurisdiction_review_pre_phase5 (107),
--       item_supersessions_pre_phase5 (5), ingest_rejections_pre_phase5 (0),
--       institution_regroup_snapshot_20260712 (66), intelligence_items_domain_backfill_audit (212).
--       All are before-state copies; the live tables are the active ones; no live data lost.
--   (b) hold_resolution_queue (39) — created by NO committed migration (out-of-repo DDL, its own finding),
--       zero code references, FULLY SUPERSEDED by drain_worklist — proven pre-drop: 32/39 entity_refs already
--       in drain_worklist, 6 items now verified (moot), 1 gone/archived, 0 rows needed migration.
--   (c) briefings (0 rows) — early-era predecessor of intelligence_items.full_brief; superseded.
--
-- APPLIED 2026-07-19 via apply_migration. Post-apply verified: all 8 to_regclass null; verified-live 210
-- intact; drain_worklist intact; validate_item_provenance still valid on a live sample.

DO $$
DECLARE
  expected jsonb := '{"intelligence_items_pre_phase5":655,"pending_jurisdiction_review_pre_phase5":107,"item_supersessions_pre_phase5":5,"ingest_rejections_pre_phase5":0,"institution_regroup_snapshot_20260712":66,"intelligence_items_domain_backfill_audit":212,"hold_resolution_queue":39,"briefings":0}';
  t text; cnt bigint;
BEGIN
  FOR t IN SELECT jsonb_object_keys(expected) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO cnt;
    RAISE NOTICE 'TOMBSTONE %: % rows at drop (audit-time %)', t, cnt, expected->>t;
    IF cnt > (expected->>t)::bigint THEN
      RAISE EXCEPTION 'ABORT: % grew to % rows (> audit-time %) — something writes it; re-audit', t, cnt, expected->>t;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.intelligence_items_pre_phase5;
DROP TABLE IF EXISTS public.pending_jurisdiction_review_pre_phase5;
DROP TABLE IF EXISTS public.item_supersessions_pre_phase5;
DROP TABLE IF EXISTS public.ingest_rejections_pre_phase5;
DROP TABLE IF EXISTS public.institution_regroup_snapshot_20260712;
DROP TABLE IF EXISTS public.intelligence_items_domain_backfill_audit;
DROP TABLE IF EXISTS public.hold_resolution_queue;
DROP TABLE IF EXISTS public.briefings CASCADE;
