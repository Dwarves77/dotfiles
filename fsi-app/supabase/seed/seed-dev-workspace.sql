-- ══════════════════════════════════════════════════════════════
-- Seed: Default Development Workspace (Dietl/Rockit)
-- ══════════════════════════════════════════════════════════════
--
-- Creates the initial organization and workspace settings
-- for the Dietl/Rockit development workspace.
--
-- This workspace uses the six original cargo verticals as its
-- sector profile. Other organizations will configure their own.
-- ══════════════════════════════════════════════════════════════

-- Create the organization
INSERT INTO organizations (id, name, slug, plan, settings)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Dietl / Rockit',
  'dietl-rockit',
  'enterprise',
  '{}'::JSONB
);

-- Create workspace settings with the six original verticals as sector profile
INSERT INTO workspace_settings (
  org_id,
  sector_profile,
  jurisdiction_weights,
  default_filters,
  alert_config
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  ARRAY['fine-art', 'live-events', 'luxury-goods', 'film-tv', 'automotive', 'humanitarian'],
  '{
    "global": 1.0, "imo": 1.0, "icao": 1.0, "eu": 1.0,
    "us": 0.9, "china": 0.9, "uk": 0.8,
    "japan": 0.7, "korea": 0.7, "canada": 0.7, "india": 0.7,
    "singapore": 0.7, "australia": 0.7,
    "asia": 0.7, "asean": 0.6, "hk": 0.6, "nordic": 0.6, "switzerland": 0.6,
    "meaf": 0.5, "brazil": 0.6, "gcc": 0.6, "uae": 0.6, "turkey": 0.6,
    "latam": 0.5, "safrica": 0.5, "wafrica": 0.4, "eafrica": 0.4,
    "nafrica": 0.4, "caribbean": 0.4, "pacific": 0.3
  }'::JSONB,
  '{}'::JSONB,
  '{"priorities": ["CRITICAL", "HIGH"]}'::JSONB
);
