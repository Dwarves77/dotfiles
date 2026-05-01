-- ════════════════════════════════════════════════════════════════════
-- Migration 009 — capture schema for tables created via dashboard editor
--
-- These three tables exist on the deployed Supabase instance but were
-- never declared in a committed migration file. Audit on 2026-04-27
-- found them referenced by code (POST /api/agent/run, several
-- supabase/seed/*.mjs scripts) but absent from migrations 001–008.
--
-- This migration is CAPTURE-ONLY. It documents the schema as observed
-- via PostgREST on 2026-04-27. All statements are idempotent
-- (CREATE TABLE IF NOT EXISTS). Running this against the live database
-- is a no-op for the existing rows; it adds the schema to the
-- repository's source-of-truth migration log.
--
-- Live row counts at capture time:
--   intelligence_summaries  2325
--   intelligence_changes       0
--   sector_contexts           15
--
-- Constraints marked "inferred" below are derived from the calling
-- code's usage pattern; the actual deployed schema may differ. Verify
-- via the Supabase dashboard SQL editor before relying on them.
--
-- RLS policies could not be read from the PostgREST access path
-- (pg_policies is not exposed). Verify RLS state for each of these
-- three tables in the dashboard SQL editor:
--   SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
--     FROM pg_policies
--    WHERE tablename IN ('intelligence_summaries',
--                        'intelligence_changes',
--                        'sector_contexts');
-- ════════════════════════════════════════════════════════════════════


-- ── intelligence_summaries ──────────────────────────────────────────
-- Per-sector synopsis content. Written by /api/agent/run and several
-- seed scripts via the delete-then-insert pattern. Read by Dashboard
-- and SectorSynopsisView.

CREATE TABLE IF NOT EXISTS intelligence_summaries (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  item_id         UUID,                                     -- FK to intelligence_items(id), inferred
  sector          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  urgency_score   NUMERIC,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version   TEXT,
  PRIMARY KEY (id)
);

-- Inferred from usage in /api/agent/run (delete-then-insert by item_id):
-- COMMENT ON TABLE intelligence_summaries IS 'Likely UNIQUE(item_id, sector) — verify in deployed schema.';

CREATE INDEX IF NOT EXISTS idx_intel_summaries_item_id ON intelligence_summaries(item_id);
CREATE INDEX IF NOT EXISTS idx_intel_summaries_sector  ON intelligence_summaries(sector);


-- ── intelligence_changes ────────────────────────────────────────────
-- Per-item change log. Written by /api/agent/run on every run.
-- 0 rows at capture — agent route runs have not landed any change
-- records yet.

CREATE TABLE IF NOT EXISTS intelligence_changes (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  item_id           UUID,                                   -- FK to intelligence_items(id), inferred
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type       TEXT NOT NULL,                          -- 'new' | 'updated' | 'archived' (inferred)
  change_severity   TEXT NOT NULL,                          -- 'minor' | 'major' (inferred)
  previous_value    JSONB,
  new_value         JSONB,
  change_summary    TEXT,
  raw_diff          TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_intel_changes_item_id     ON intelligence_changes(item_id);
CREATE INDEX IF NOT EXISTS idx_intel_changes_detected_at ON intelligence_changes(detected_at DESC);


-- ── sector_contexts ─────────────────────────────────────────────────
-- The 15-sector master list that drives runtime synopsis generation.
-- Read by /api/agent/run, generate-synopses.mjs, and several other
-- seed scripts. The synopsis_prompt field is what makes each sector
-- synopsis specific rather than generic — see CLAUDE.md "AGENT
-- ARCHITECTURE" section.

CREATE TABLE IF NOT EXISTS sector_contexts (
  sector             TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  transport_modes    TEXT[] NOT NULL,
  cargo_types        TEXT[] NOT NULL,
  compliance_roles   TEXT[] NOT NULL,
  synopsis_prompt    TEXT NOT NULL,
  urgency_weights    JSONB NOT NULL,
  PRIMARY KEY (sector)
);
