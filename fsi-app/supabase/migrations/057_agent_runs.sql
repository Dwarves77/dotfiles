-- ════════════════════════════════════════════════════════════════════
-- Migration 057 — agent_runs telemetry table.
--
-- Wave 1a foundation: one row per /api/agent/run invocation. Captures
-- timing, fetch outcome, cost estimate, and FK linkage to the
-- raw_fetches and intelligence_item_versions rows produced.
--
-- The MTD spend tile reads from this table via a partial index limited
-- to the current month so the tile query stays cheap.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_runs (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                       UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_url                      TEXT,
  fetch_method                    TEXT,
  started_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at                        TIMESTAMPTZ,
  duration_ms                     INT,
  status                          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'skipped', 'error')),
  cost_usd_estimated              NUMERIC(10, 6) NOT NULL DEFAULT 0,
  errors                          JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetch_status                    INT,
  fetch_html_bytes                BIGINT,
  fetch_text_bytes                BIGINT,
  fetch_render_ms                 INT,
  raw_fetch_id                    UUID REFERENCES raw_fetches(id) ON DELETE SET NULL,
  intelligence_item_id            UUID REFERENCES intelligence_items(id) ON DELETE SET NULL,
  intelligence_item_version_id    UUID REFERENCES intelligence_item_versions(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_source_started
  ON agent_runs (source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON agent_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_started_desc
  ON agent_runs (started_at DESC);

-- Partial index for the MTD spend tile. Recreated each month is OK,
-- the tile query plan is the same shape regardless.
CREATE INDEX IF NOT EXISTS idx_agent_runs_mtd
  ON agent_runs (started_at, cost_usd_estimated, status);

COMMENT ON TABLE agent_runs IS
  'One row per /api/agent/run invocation. Insert at request start, update in finally with terminal state. Drives the MTD spend tile and the wave-1 cost meter hard halt.';

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_runs_service_role_all ON agent_runs;
CREATE POLICY agent_runs_service_role_all ON agent_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
