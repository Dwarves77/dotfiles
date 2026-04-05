-- ══════════════════════════════════════════════════════════════
-- Migration 006: Multi-Tenant Workspace Architecture
-- ══════════════════════════════════════════════════════════════
--
-- Adds the three-layer model:
--   PLATFORM — shared global intelligence (sources, items)
--   WORKSPACE — organization-scoped data (overrides, settings)
--   SECTOR — user-configurable relevance weighting
--
-- Platform data is never mutated by workspace actions.
-- Workspace data is isolated per organization.
-- ══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- TABLE: organizations
-- Multi-tenant root entity. Every workspace belongs to one org.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE organizations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  slug                     TEXT UNIQUE NOT NULL,
  plan                     TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);


-- ══════════════════════════════════════════════════════════════
-- TABLE: org_memberships
-- Maps users to organizations with roles.
-- A user can belong to multiple organizations.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE org_memberships (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_memberships_org ON org_memberships(org_id);
CREATE INDEX idx_memberships_user ON org_memberships(user_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE: workspace_item_overrides
-- Per-organization overrides on top of shared platform items.
-- Platform intelligence_items are NEVER mutated by workspace
-- actions. Priority overrides, archive decisions, and notes
-- live here instead.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE workspace_item_overrides (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id                  UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,

  -- Priority override (null = use platform default)
  priority_override        TEXT
    CHECK (priority_override IS NULL OR priority_override IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),

  -- Archive override (workspace can archive items from their view without affecting platform)
  is_archived              BOOLEAN NOT NULL DEFAULT FALSE,
  archive_reason           TEXT,
  archive_note             TEXT,
  archived_at              TIMESTAMPTZ,

  -- Workspace-specific notes (why this matters to THIS org)
  notes                    TEXT NOT NULL DEFAULT '',

  -- Workspace-specific tags
  workspace_tags           TEXT[] NOT NULL DEFAULT '{}',

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id, item_id)
);

CREATE INDEX idx_overrides_org ON workspace_item_overrides(org_id);
CREATE INDEX idx_overrides_item ON workspace_item_overrides(item_id);
CREATE INDEX idx_overrides_org_archived ON workspace_item_overrides(org_id)
  WHERE is_archived = TRUE;


-- ══════════════════════════════════════════════════════════════
-- TABLE: workspace_settings
-- Per-organization configuration: sector profile, jurisdiction
-- weights, default filters, alert config.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE workspace_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Sector profile — configurable list of freight sectors this org operates in
  -- e.g. ["fine-art", "live-events", "luxury-goods"]
  -- Platform provides a master list of available sectors. Org selects which apply.
  sector_profile           TEXT[] NOT NULL DEFAULT '{}',

  -- Jurisdiction weights — override platform defaults for urgency scoring
  -- Keys are jurisdiction IDs, values are weights 0.0-1.0
  -- null = use platform defaults
  jurisdiction_weights     JSONB,

  -- Default filters applied when workspace members open the dashboard
  default_filters          JSONB NOT NULL DEFAULT '{}',

  -- Alert configuration — which priorities trigger notifications
  alert_config             JSONB NOT NULL DEFAULT '{"priorities": ["CRITICAL", "HIGH"]}',

  -- Home section visibility
  home_sections            JSONB NOT NULL DEFAULT '{
    "summaryStrip": true,
    "weeklyBriefing": true,
    "whatChanged": true,
    "topUrgency": true,
    "dueThisQuarter": true,
    "supersessions": true
  }',

  -- Export preferences
  default_export_format    TEXT NOT NULL DEFAULT 'html'
    CHECK (default_export_format IN ('html', 'slack')),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id)
);

CREATE INDEX idx_workspace_settings_org ON workspace_settings(org_id);


-- ══════════════════════════════════════════════════════════════
-- Add org_id to briefings (workspace-scoped)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_briefings_org ON briefings(org_id);


-- ══════════════════════════════════════════════════════════════
-- FUNCTION: Auto-update timestamps on workspace tables
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspace_overrides_updated_at
  BEFORE UPDATE ON workspace_item_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════════════════════════════
-- FUNCTION: Check if a user belongs to an organization
-- Used by RLS policies.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION user_belongs_to_org(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_memberships
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ══════════════════════════════════════════════════════════════
-- FUNCTION: get_workspace_intelligence(p_org_id)
-- Returns platform intelligence items merged with workspace
-- overrides for a SPECIFIC organization only.
--
-- This replaces the old view which leaked cross-org overrides.
-- The org_id parameter ensures a user only ever sees their own
-- organization's priority overrides, archive decisions, and notes.
--
-- Items archived by this workspace are excluded by default.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_workspace_intelligence(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
  operational_impact       TEXT,
  open_questions           TEXT[],
  tags                     TEXT[],
  domain                   INT,
  category                 TEXT,
  item_type                TEXT,
  source_id                UUID,
  source_url               TEXT,
  jurisdictions            TEXT[],
  transport_modes          TEXT[],
  verticals                TEXT[],
  status                   TEXT,
  severity                 TEXT,
  confidence               TEXT,
  priority                 TEXT,
  reasoning                TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  archive_reason           TEXT,
  archive_note             TEXT,
  archived_date            DATE,
  replaced_by              UUID,
  version_history          JSONB,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ,
  -- Workspace overlay fields
  priority_override        TEXT,
  effective_priority       TEXT,
  effective_archived       BOOLEAN,
  workspace_archive_reason TEXT,
  workspace_archive_note   TEXT,
  workspace_notes          TEXT,
  workspace_tags           TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.operational_impact,
    ii.open_questions,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.reasoning,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    ii.archive_reason,
    ii.archive_note,
    ii.archived_date,
    ii.replaced_by,
    ii.version_history,
    ii.created_at,
    ii.updated_at,
    -- Workspace overlay
    wo.priority_override,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived) AS effective_archived,
    wo.archive_reason AS workspace_archive_reason,
    wo.archive_note AS workspace_archive_note,
    wo.notes AS workspace_notes,
    wo.workspace_tags
  FROM intelligence_items ii
  LEFT JOIN workspace_item_overrides wo
    ON wo.item_id = ii.id
    AND wo.org_id = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ══════════════════════════════════════════════════════════════
-- COMMENTS
-- ══════════════════════════════════════════════════════════════

COMMENT ON TABLE organizations IS 'Multi-tenant root entity. Every workspace belongs to one org.';
COMMENT ON TABLE org_memberships IS 'Maps users to organizations. A user can belong to multiple orgs.';
COMMENT ON TABLE workspace_item_overrides IS 'Per-org overrides on platform intelligence items. Priority, archive, notes. Platform data is never mutated.';
COMMENT ON TABLE workspace_settings IS 'Per-org configuration: sector profile, jurisdiction weights, filters, alerts.';
COMMENT ON COLUMN workspace_item_overrides.priority_override IS 'NULL = use platform default. Non-null = this org sees this priority instead.';
COMMENT ON FUNCTION get_workspace_intelligence IS 'Returns platform items merged with workspace overrides for ONE org. Excludes workspace-archived items. Takes org_id as parameter — no cross-org data leakage.';
