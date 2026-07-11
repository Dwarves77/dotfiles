-- Migration 184: drop the frozen ingestion pair (Wave-α Track E, dead-weight erase e7).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- Numbered 184 (180 views, 181 vendors, 182/183 user_profiles; 164–179 reserved for Track B).
--
-- PRECONDITION (orchestrator MUST honor): run scripts/_wave-alpha/export-ingestion-pair.mjs FIRST and
-- relocate its output (ingestion_state.jsonl + ingestion_control_log.jsonl + manifest.json) to the
-- PRIVATE repo Dwarves77/caros-ledge-backups under archives/ingestion-pair-2026-07-11/. These 1,483
-- rows are the only record of the 2026-05-10 cold-start control history; capture before dropping.
--
-- Rollback: supabase/rollbacks/184_drop_ingestion_pair.down.sql (recreates schema; the archived JSONL
-- is the data restore source — re-import from the private-repo snapshot, not from this file).
--
-- Confirmed dead (audit + fresh 2026-07-11):
--   * Zero consumers in src/ (live pause logic reads system_state + sources.processing_paused;
--     auto-run lives on sources.auto_run_enabled). Only scripts (wave1-cold-start writer + diag reads)
--     touch these tables. [DB-3 F5, DB-4 F4c]
--   * Frozen + contradictory: ingestion_control_log = 709 rows ALL {action:auto_run_disabled,
--     actor:cold_start} dated 2026-05-10; ingestion_state = 774 rows all auto_run_enabled=true with no
--     re-enable ever logged — the two surfaces cannot both be true; neither is maintained.
--   * No inbound FK (both only FK OUT to sources ON DELETE CASCADE); no triggers.

BEGIN;

DROP TABLE IF EXISTS public.ingestion_control_log CASCADE;
DROP TABLE IF EXISTS public.ingestion_state       CASCADE;

COMMIT;
