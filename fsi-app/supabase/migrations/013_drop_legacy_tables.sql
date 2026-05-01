-- ════════════════════════════════════════════════════════════════════
-- Migration 013 — drop the six legacy intelligence tables.
--
-- Supersedes migration 012 (which only added DEPRECATED COMMENT ON
-- annotations). Per Rule 11 (Deprecation means deletion, not
-- annotation), once Phase A.5 was verified end-to-end on the preview
-- deploy and Phase B was in flight, the legacy tables move from the
-- "annotated as deprecated" state to the deleted state. Their data is
-- mirrored 1:1 into the item_* tables by migrations 010 and 011, and
-- no application code path references the legacy tables (verified by
-- grep of src/ for `from('resources'|'timelines'|'changelog'|'disputes'
-- |'cross_references'|'supersessions')` returning zero matches at
-- 2026-04-28).
--
-- Apply via the Supabase dashboard SQL editor — DDL of any kind cannot
-- be executed through the @supabase/supabase-js client. CASCADE
-- removes any FK constraints that referenced these tables (none should
-- remain, but CASCADE is defensive).
--
-- Rollback path: the data is recoverable from the corresponding item_*
-- tables (intelligence_items, item_timelines, item_changelog,
-- item_disputes, item_cross_references, item_supersessions). The 5
-- ghost intelligence_items rows seeded by migration 011 (legacy_id
-- ss1..ss5) preserve the orphan supersession audit trail.
-- ════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS supersessions      CASCADE;
DROP TABLE IF EXISTS cross_references   CASCADE;
DROP TABLE IF EXISTS disputes           CASCADE;
DROP TABLE IF EXISTS changelog          CASCADE;
DROP TABLE IF EXISTS timelines          CASCADE;
DROP TABLE IF EXISTS resources          CASCADE;
