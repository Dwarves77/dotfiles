-- ════════════════════════════════════════════════════════════════════
-- Migration 016 — processing pause for budget control.
--
-- Two pause flags:
--   sources.processing_paused (per-source) — pauses one source's
--     automated processing while keeping its registry record live.
--   system_state.global_processing_paused (system-wide) — pauses ALL
--     automated source processing in one switch. Singleton row enforced
--     by a BOOLEAN PRIMARY KEY with CHECK (id = true).
--
-- Which routes honour these flags:
--   /api/worker/check-sources    — global gate first, then per-source
--   /api/agent/run               — both gates; 409 Conflict if paused
--   /api/admin/recompute-trust   — both gates
--
-- Manual operator actions bypass pause state because they're explicit:
--   /api/admin/sources/[id]/fetch-now
--   /api/admin/sources/[id]/regenerate-brief
--   /api/data/fetch-source        (admin-triggered direct fetch)
--
-- Apply via Supabase Dashboard SQL Editor — DDL cannot run via
-- @supabase/supabase-js. The INSERT … ON CONFLICT clause makes this
-- safe to re-run.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS processing_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sources.processing_paused IS
  'When true, automated processing skips this source (worker scan, agent runs, trust recompute). Manual fetch and regenerate actions still work — they bypass pause state by design.';

CREATE TABLE IF NOT EXISTS system_state (
  id                       BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  global_processing_paused BOOLEAN NOT NULL DEFAULT false,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_state IS
  'Singleton table for application-wide flags. Enforced as a singleton by BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true) — only one row can ever exist.';

INSERT INTO system_state (id, global_processing_paused)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;
