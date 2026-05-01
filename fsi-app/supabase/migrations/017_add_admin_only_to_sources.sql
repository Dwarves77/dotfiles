-- ════════════════════════════════════════════════════════════════════
-- Migration 017 — sources.admin_only
--
-- Per CLAUDE.md ("admin_only sources are visible only to platform
-- admins, not regular workspace users. Used for testing sources,
-- internal research feeds, and noisy sources not yet ready for general
-- visibility."), reads from /api/sources and any other workspace-facing
-- query MUST gate on (status='active' AND admin_only=false). Admin
-- contexts (SourceHealthDashboard, /api/admin/*) read without the
-- admin_only filter.
--
-- Apply via Supabase Dashboard SQL Editor.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS admin_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sources.admin_only IS
  'When true, this source is visible only to platform admins. Workspace-facing reads gate on (status = active AND admin_only = false). Admin contexts (SourceHealthDashboard, /api/admin/*) read without the admin_only filter.';

CREATE INDEX IF NOT EXISTS sources_workspace_visible_idx
  ON sources (status, admin_only) WHERE status = 'active' AND admin_only = false;
