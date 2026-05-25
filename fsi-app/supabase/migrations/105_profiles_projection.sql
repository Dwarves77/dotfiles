-- Migration 105: profiles projection columns per operator Q6 decision
-- (2026-05-24). v2 with handling for the existing `region` column.
--
-- Q6: confirmed columns with one adjustment (region as text[] not
--     single ISO code per operator note that workspaces serve multiple
--     regions, e.g. NYC + LA + London).
--
-- Columns added/converted on profiles:
--   - org_id UUID, current/primary org for this user. Nullable.
--     org_memberships stays authoritative for multi-org membership;
--     this column is the "active" org chosen by the user (org switcher
--     writes here). FK to organizations.
--   - workspace_role TEXT, denormalized current role for the active
--     org. Mirrors org_memberships.role for the row where
--     org_memberships.org_id = profiles.org_id. NULL when no active
--     org. Constrained to known roles.
--   - sector TEXT[], multi-sector workspaces. Defaults to empty array.
--     Populated from workspace_settings sector profile + user
--     onboarding. The 6-checked-vs-2-displayed bug confirmed by the
--     2026-05-24 audit traces to this column being absent.
--   - region TEXT[], multi-region workspaces. PRE-EXISTING column was
--     scalar text; converted to text[] in-place, preserving existing
--     values by wrapping each into a single-element array.

BEGIN;

-- ── Convert existing scalar region to text[] ─────────────────────
-- profiles.region currently exists as scalar text. Convert in place,
-- wrapping the existing value (if any) into a single-element array.
-- USING handles the cast for existing rows.
ALTER TABLE profiles
  ALTER COLUMN region TYPE TEXT[]
  USING (
    CASE
      WHEN region IS NULL OR region = '' THEN ARRAY[]::TEXT[]
      ELSE ARRAY[region]
    END
  );

ALTER TABLE profiles
  ALTER COLUMN region SET DEFAULT '{}',
  ALTER COLUMN region SET NOT NULL;

-- ── Add new columns ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workspace_role TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_workspace_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_workspace_role_check
  CHECK (workspace_role IS NULL OR workspace_role IN (
    'owner', 'admin', 'editor', 'member', 'viewer'
  ));

CREATE INDEX IF NOT EXISTS idx_profiles_org_id
  ON profiles(org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_sector
  ON profiles USING GIN (sector);

CREATE INDEX IF NOT EXISTS idx_profiles_region
  ON profiles USING GIN (region);

COMMENT ON COLUMN profiles.org_id IS
  'Current/primary org for this user (Q6, 2026-05-24). Nullable. org_memberships stays authoritative for multi-org membership; org switcher writes the active selection here.';

COMMENT ON COLUMN profiles.workspace_role IS
  'Denormalized current role for the active org (Q6, 2026-05-24). Mirrors org_memberships.role for the row matching profiles.org_id. NULL when no active org.';

COMMENT ON COLUMN profiles.sector IS
  'Multi-sector workspace profile (Q6, 2026-05-24). text[] because operators serve multiple verticals. Populated from workspace_settings + user onboarding. Surfaces consume via the projection on every masthead and Community author identity.';

COMMENT ON COLUMN profiles.region IS
  'Multi-region workspace profile (Q6, 2026-05-24). text[] because operators serve multiple regions (e.g. NYC + LA + London). Pre-existing scalar text column was converted to text[] in-place, preserving prior values as single-element arrays.';

COMMIT;
