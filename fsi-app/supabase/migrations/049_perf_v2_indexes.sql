-- Migration 049 — perf v2 indexes (2026-05-08)
--
-- Adds indexes targeting the regulation-detail server-render bottleneck
-- surfaced in the perf v2 measurement baseline. Per the dispatch:
--   - Dashboard server render median 1100 ms, worst 2472 ms
--   - Regulation detail server render 1750 ms
--
-- Investigation against the live schema (migrations 003, 009, 020, 026,
-- 033) found the most useful indexes already exist:
--   - intelligence_items.legacy_id     → idx_items_legacy
--   - intelligence_items.priority      → idx_items_priority
--   - intelligence_items.jurisdictions → idx_items_jurisdictions (GIN)
--   - intelligence_items.jurisdiction_iso → idx_intel_items_jurisdiction_iso
--     (migration 033, GIN)
--   - intelligence_items.tags          → idx_items_tags (GIN)
--   - intelligence_changes(item_id, detected_at) → covered by 028 indexes
--   - workspace_item_overrides(org_id, item_id) → idx_overrides_*
--   - item_timelines(item_id)          → idx_item_timelines_item
--   - item_changelog(item_id)          → idx_item_changelog_item
--   - item_disputes(item_id)           → idx_item_disputes_item
--   - item_cross_references(source_item_id, target_item_id) → idx_item_xref_*
--
-- This migration adds only the indexes that ARE missing and that the
-- regulation-detail Promise.all path (perf v2 — supabase-server.ts
-- fetchIntelligenceItem) reads on every detail render:
--
--   1. item_supersessions(old_item_id) and item_supersessions(new_item_id)
--      — table has no indexes today; the .or() lookup runs sequential
--      scans on every regulation-detail render.
--   2. intelligence_items(added_date DESC) — used by the Research and
--      Dashboard "recently added" sort path. The Dashboard render shape
--      reads ~155 rows then sorts in JS today; an index lets future
--      pagination + DB-side sorting collapse the cost.
--
-- Note: Supabase / PostgREST `CREATE INDEX` is non-transactional in
-- psql session mode. `CREATE INDEX CONCURRENTLY` would avoid table
-- locks but cannot run inside a migration transaction. These indexes
-- are small (a few rows for supersessions, ~155 for added_date) so
-- a brief lock is acceptable. If applied against a heavily-loaded
-- production with millions of rows, swap to CONCURRENTLY and run
-- outside the transaction wrapper.

-- ── 1. item_supersessions ─────────────────────────────────────────
-- The fetchIntelligenceItem path uses:
--   .or(`old_item_id.eq.X,new_item_id.eq.X`)
-- which fans out to two index lookups when both columns are indexed.
CREATE INDEX IF NOT EXISTS idx_item_supersessions_old
  ON item_supersessions(old_item_id);

CREATE INDEX IF NOT EXISTS idx_item_supersessions_new
  ON item_supersessions(new_item_id);

-- ── 2. intelligence_items.added_date ──────────────────────────────
-- "Recently added" sort path. Descending so ORDER BY added_date DESC
-- can scan the index in order without an explicit Sort node.
CREATE INDEX IF NOT EXISTS idx_intel_items_added_date_desc
  ON intelligence_items(added_date DESC);

-- ── Verification (read-only — run these in the SQL editor after apply)
--   SELECT indexname FROM pg_indexes WHERE tablename = 'item_supersessions';
--     → expects: idx_item_supersessions_old, idx_item_supersessions_new
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'intelligence_items'
--       AND indexname = 'idx_intel_items_added_date_desc';
--     → expects: 1 row
--
-- After verification, the regulation-detail .or(old_item_id, new_item_id)
-- supersessions lookup should report Index Scan in EXPLAIN ANALYZE
-- instead of Seq Scan.
