-- ════════════════════════════════════════════════════════════════════
-- Migration 055 — sources.auto_run_enabled per-source kill switch.
--
-- Wave 1a foundation: a per-source toggle separate from
-- processing_paused. Semantics:
--   - processing_paused: temporary, operator-set, often time-bound
--   - auto_run_enabled:  durable, per-source, default-on, the
--                        cold-start script flips ALL 718 to false
--                        after the first backfill pass and operators
--                        re-enable explicitly per source.
--
-- The scheduled GHA worker honors auto_run_enabled = true; manual
-- admin actions ignore it.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS auto_run_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_sources_auto_run_enabled_true
  ON sources (id)
  WHERE auto_run_enabled = TRUE;

COMMENT ON COLUMN sources.auto_run_enabled IS
  'Per-source kill switch for the scheduled worker. Default TRUE for new sources. Cold-start script flips all 718 active sources to FALSE on first run; operators re-enable per source after vetting.';
