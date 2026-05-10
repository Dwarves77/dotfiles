-- ════════════════════════════════════════════════════════════════════
-- Migration 054 — sources scoreboard columns.
--
-- Wave 1a foundation: per-source last-content tracking. Distinct from
-- last_scanned (cooldown timestamp) and last_checked (HEAD prober):
--   - last_content_hash         most recent raw_fetch.content_hash
--   - last_content_fetched_at   most recent raw_fetch.fetched_at
--   - last_intelligence_item_at most recent intelligence_items insert
--                               or update tied to this source
--
-- Used by the source health dashboard scoreboard tile and the cold
-- start backfill check (skip sources that already produced an item).
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS last_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_content_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_intelligence_item_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sources_last_content_fetched_at
  ON sources (last_content_fetched_at DESC NULLS LAST);

COMMENT ON COLUMN sources.last_content_hash IS
  'SHA-256 of the last raw_fetch HTML body. Compared against the new fetch hash to short-circuit no-change reprocessing.';

COMMENT ON COLUMN sources.last_content_fetched_at IS
  'Timestamp of the last successful raw_fetch for this source. Distinct from last_scanned (cooldown timer) and last_checked (HEAD prober).';

COMMENT ON COLUMN sources.last_intelligence_item_at IS
  'Timestamp of the last intelligence_items create or regenerate against this source. Drives the cold-start backfill skip and source-health staleness signal.';
