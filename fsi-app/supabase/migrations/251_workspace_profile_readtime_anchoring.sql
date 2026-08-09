-- Migration 251: workspace profile for read-time contextualization (Option B, operator-ruled 2026-08-09).
--
-- APPLIED LIVE 2026-08-09 via Supabase MCP ahead of this commit — this file is the audit record per the
-- code-vs-data doctrine, NOT a pending apply. Verified in the live ledger.
--
-- Shared intelligence briefs stay ROLE-GENERIC (correct for shared canonical analysis). Per-workspace
-- anchoring is applied at READ time from this profile — NOT baked into the shared brief. workspace_settings
-- already carries sector_profile (cargo verticals) + jurisdiction_weights; this adds the remaining profile
-- fields the read layer needs (roles, transport modes, trade lanes, products, operational baseline) as one
-- jsonb, so the full profile is per-org data. Additive, nullable-with-default; no existing column touched.
--
-- Shape (consumed by src/lib/workspace/profile.ts):
--   { roles: text[], transport_modes: text[], trade_lanes: text[], products: text[],
--     operational_baseline: text[], office_footprint: text, regulation_scope: text }

ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workspace_settings.profile IS
  'Read-time anchoring profile (Option B, mig 251): roles/transport_modes/trade_lanes/products/operational_baseline/office_footprint/regulation_scope. Cargo verticals live in sector_profile, jurisdictions in jurisdiction_weights. Consumed by the read-time contextualization layer, never by generation (shared briefs stay role-generic).';

-- Seed the current workspace from the captured profile (operator statement + live data, 2026-08-09).
-- Idempotent: last-write-wins on the single row; re-running restates the same values.
UPDATE public.workspace_settings
SET profile = jsonb_build_object(
      'roles', jsonb_build_array('freight forwarder', 'importer', 'exporter'),
      'transport_modes', jsonb_build_array('air', 'ocean', 'road'),
      'trade_lanes', jsonb_build_array('worldwide'),
      'products', '[]'::jsonb,
      'operational_baseline', jsonb_build_array(
        'automating wherever possible, with deliberate manual steps (tagging, routing/shaping information to fit operational need)'),
      'office_footprint', '80 offices globally',
      'regulation_scope', 'all freight-forwarding, import/export, and freight-sustainability regulation worldwide'
    )
WHERE org_id = 'a0000000-0000-0000-0000-000000000001';
