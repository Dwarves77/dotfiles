-- ════════════════════════════════════════════════════════════════════
-- Migration 058 — ingestion_control_log audit trail.
--
-- Wave 1a foundation: append-only audit of every state change to
-- ingestion control flags (auto_run_enabled, processing_paused). The
-- cold-start script writes one row per source when it sets
-- auto_run_enabled=false; manual operator toggles in the admin panel
-- write here too.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingestion_control_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID REFERENCES sources(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icl_source_created
  ON ingestion_control_log (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_icl_created_at
  ON ingestion_control_log (created_at DESC);

COMMENT ON TABLE ingestion_control_log IS
  'Append-only audit log of ingestion control state changes. Action examples: auto_run_disabled, auto_run_enabled, processing_paused, processing_resumed. Actor is a free-form identifier (cold_start, admin:<user_id>, worker, etc.).';

ALTER TABLE ingestion_control_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS icl_service_role_all ON ingestion_control_log;
CREATE POLICY icl_service_role_all ON ingestion_control_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON ingestion_control_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON ingestion_control_log FROM authenticated;
REVOKE UPDATE, DELETE ON ingestion_control_log FROM anon;
