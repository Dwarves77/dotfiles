-- ════════════════════════════════════════════════════════════════════
-- Migration 059 — ingestion_state per-source operational state.
--
-- Wave 1a foundation: single-row-per-source operational state mirror.
-- Holds the same auto_run_enabled and processing_paused values that
-- live on sources for query-path performance, plus the last state
-- change timestamp and reason for the admin panel state column.
--
-- Backfilled on creation from sources. Future toggles update both the
-- sources column and this table in one transaction (or via trigger in
-- a follow-up wave).
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingestion_state (
  source_id                  UUID PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  auto_run_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  processing_paused          BOOLEAN NOT NULL DEFAULT FALSE,
  last_state_change_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_state_change_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_state_auto_run_enabled
  ON ingestion_state (auto_run_enabled, last_state_change_at DESC);

COMMENT ON TABLE ingestion_state IS
  'Single-row-per-source mirror of ingestion control flags with last-change metadata. Backfilled from sources on creation; subsequent updates write here and to sources in one transaction.';

-- Backfill from sources. Uses INSERT ON CONFLICT for idempotency.
INSERT INTO ingestion_state (source_id, auto_run_enabled, processing_paused)
SELECT id,
       COALESCE(auto_run_enabled, TRUE),
       COALESCE(processing_paused, FALSE)
  FROM sources
ON CONFLICT (source_id) DO NOTHING;

ALTER TABLE ingestion_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_state_service_role_all ON ingestion_state;
CREATE POLICY ingestion_state_service_role_all ON ingestion_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
