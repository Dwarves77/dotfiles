-- Migration 185: drop proven-dead columns (Wave-α Track E, dead-weight erase e9).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- Numbered 185 (180 views, 181 vendors, 182/183 user_profiles, 184 ingestion pair;
-- 164–179 reserved for Track B). One migration, grouped BY TABLE (per e9 instruction).
--
-- Scope discipline (e9): drops ONLY columns whose zero-reader status the X register proves AND that
-- were re-confirmed dead THIS session by BOTH (a) precise code grep = 0 readers in src/+scripts/, and
-- (b) a live catalog probe = 0 references in any function/view/trigger body + all-NULL data (no loss).
-- Every column below cleared all three checks. The many ambiguous columns from X.1(a) are HELD (see
-- docs/ops/wave-alpha-closeout-2026-07-11/deletions-log.md e9 held-list) — NOT dropped here.
--
-- Verified 2026-07-11:
--   intelligence_item_versions.created_by_run_id  — NULL ×all; src=0; no fn/view ref. [X.1(a); DB-1 VER-1]
--   regions.operations_decisions                  — '{}' ×5; src=0; regions selects are explicit and
--                                                    exclude it; no fn/view ref. [X.1(a); DB-1 RGN-1]
--   region_dimension_coverage.last_reviewed_at    — NULL ×all; src=0 (both rdc selects list explicit
--                                                    cols w/o it); no fn/view ref. [X.1(a); DB-1 RDC-1]
--                                                    NOTE: rdc.notes is HELD — it IS read
--                                                    (supabase-server.ts:1984).
--   sources.classification_observed_distribution  — NULL ×all; src=0; no fn/view ref. [X.1(a); DB-2 F6]
--   sources.last_observed_at                       — NULL ×all; src=0; no fn/view ref. [X.1(a); DB-2 F6]
--   sources.spotchecked_at, sources.spotchecked_by — NULL ×all; src=0 (only the `spotchecked` bool is
--                                                    read); no fn/view ref. [X.1(a); DB-2 F6]
--                                                    NOTE: sources.cited_by is HELD — it IS read
--                                                    (supabase-server.ts:259,320).
--
-- Rollback: supabase/rollbacks/185_drop_dead_columns.down.sql (re-adds all 7 as NULLable, no backfill
-- — all were all-NULL/default at drop). No sources select("*") consumer breaks (a dropped column simply
-- disappears from the wildcard).

BEGIN;

ALTER TABLE public.intelligence_item_versions DROP COLUMN IF EXISTS created_by_run_id;

ALTER TABLE public.regions DROP COLUMN IF EXISTS operations_decisions;

ALTER TABLE public.region_dimension_coverage DROP COLUMN IF EXISTS last_reviewed_at;

ALTER TABLE public.sources DROP COLUMN IF EXISTS classification_observed_distribution;
ALTER TABLE public.sources DROP COLUMN IF EXISTS last_observed_at;
ALTER TABLE public.sources DROP COLUMN IF EXISTS spotchecked_at;
ALTER TABLE public.sources DROP COLUMN IF EXISTS spotchecked_by;

COMMIT;
