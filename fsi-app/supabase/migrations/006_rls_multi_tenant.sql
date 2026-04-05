-- ══════════════════════════════════════════════════════════════
-- Migration 006 RLS: Multi-Tenant Row Level Security
-- ══════════════════════════════════════════════════════════════
--
-- Platform data (sources, intelligence_items): readable by all
-- authenticated users, writable only by service_role.
--
-- Workspace data (overrides, settings, briefings): readable and
-- writable only by members of the matching org_id.
-- ══════════════════════════════════════════════════════════════

-- ── Enable RLS ──
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_item_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════
-- Organizations
-- Users can read orgs they belong to. Service role manages all.
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "org_read_members"
  ON organizations FOR SELECT
  USING (
    user_belongs_to_org(id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "org_write_service"
  ON organizations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "org_update_admin"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE org_id = organizations.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );


-- ══════════════════════════════════════════════════════════════
-- Org Memberships
-- Users can read memberships for their own orgs.
-- Only owners/admins and service_role can modify.
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "membership_read"
  ON org_memberships FOR SELECT
  USING (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "membership_write_admin"
  ON org_memberships FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.org_id = org_memberships.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "membership_update_admin"
  ON org_memberships FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.org_id = org_memberships.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "membership_delete_admin"
  ON org_memberships FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.org_id = org_memberships.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );


-- ══════════════════════════════════════════════════════════════
-- Workspace Item Overrides
-- Members can read and write overrides for their own org only.
-- No cross-org visibility.
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "overrides_read_org"
  ON workspace_item_overrides FOR SELECT
  USING (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "overrides_insert_org"
  ON workspace_item_overrides FOR INSERT
  WITH CHECK (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "overrides_update_org"
  ON workspace_item_overrides FOR UPDATE
  USING (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "overrides_delete_org"
  ON workspace_item_overrides FOR DELETE
  USING (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );


-- ══════════════════════════════════════════════════════════════
-- Workspace Settings
-- Members can read their org settings. Admin+ can write.
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "settings_read_org"
  ON workspace_settings FOR SELECT
  USING (
    user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "settings_write_admin"
  ON workspace_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE org_id = workspace_settings.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "settings_update_admin"
  ON workspace_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE org_id = workspace_settings.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );


-- ══════════════════════════════════════════════════════════════
-- Briefings — scope to org_id
-- Update existing policy to include org scoping.
-- ══════════════════════════════════════════════════════════════

-- Drop old public read policy if exists
DROP POLICY IF EXISTS "Public read" ON briefings;

CREATE POLICY "briefings_read_org"
  ON briefings FOR SELECT
  USING (
    org_id IS NULL  -- Legacy briefings without org are readable by all
    OR user_belongs_to_org(org_id)
    OR auth.role() = 'service_role'
  );

CREATE POLICY "briefings_write_service"
  ON briefings FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
