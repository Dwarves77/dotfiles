-- subject: Migration 219 (structure-audit cleanup, operator ruling 2026-07-19). Tombstone-then-delete DROP of 8 dead tables per the full-schema audit (docs/audits/supabase-structure-audit-2026-07-19.md): the 6 zero-code-ref backup/one-shot tables (intelligence_items_pre_phase5 655, pending_jurisdiction_review_pre_phase5 107, item_supersessions_pre_phase5 5, ingest_rejections_pre_phase5 0, institution_regroup_snapshot_20260712 66, intelligence_items_domain_backfill_audit 212), hold_resolution_queue (39; created by NO committed migration = out-of-repo DDL; superseded by drain_worklist, proven: 32/39 already in drain, 6 verified, 1 gone, 0 rows needed migration), and briefings (0; early predecessor of full_brief). Content-gated (a table that grew since audit ABORTS). **APPLIED 2026-07-19** via apply_migration; post-apply verified: all 8 to_regclass null, verified-live 210 intact, drain_worklist intact, validator valid on a live sample. Backups reversible only from their creating migrations (live data untouched).
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
--
-- 2026-10-08 (lane MIG-CI, ruling after replay run 37792517133, class OUT-OF-REPO-DROP): the tombstone loop below skips a table that
-- does not exist (to_regclass guard with a NOTICE) instead of failing on the count. Six of the eight tables (all of (a) except
-- intelligence_items_domain_backfill_audit, and (b)) are created by NO committed migration, so on a replay from the repo files they
-- never exist and the pre-drop count was refused (relation does not exist). The grew-abort guard is unchanged for every table that
-- exists. The drops are already IF EXISTS, so the end state (all eight absent) is the same; the schema oracle confirms it.

DO $$
DECLARE
  expected jsonb := '{"intelligence_items_pre_phase5":655,"pending_jurisdiction_review_pre_phase5":107,"item_supersessions_pre_phase5":5,"ingest_rejections_pre_phase5":0,"institution_regroup_snapshot_20260712":66,"intelligence_items_domain_backfill_audit":212,"hold_resolution_queue":39,"briefings":0}';
  t text; cnt bigint;
BEGIN
  FOR t IN SELECT jsonb_object_keys(expected) LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'TOMBSTONE %: absent, nothing to count', t;
      CONTINUE;
    END IF;
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
