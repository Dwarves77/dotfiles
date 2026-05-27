-- Migration 108: Extend get_market_intel_items RPC to surface
-- signal_band + trajectory_points columns. Sprint 3 A4-2.
--
-- Background: migration 070 defined get_market_intel_items with a
-- 27-column RETURNS TABLE shape that pre-dated the signal_band column
-- (migration 102) and trajectory_points column (migration 107). The
-- src-side mapper at supabase-server.ts:rpcRowToResource already
-- expects these via `row.signal_band || undefined`, so they have been
-- arriving as undefined since 102 landed.
--
-- This migration extends the RPC's RETURNS TABLE + SELECT list so the
-- two columns reach the page payload. theme and severity stay where
-- they are (severity was always in 070's return shape; theme is gated
-- to research format and not needed on /market).
--
-- A4-3's component-layer guard relies on item.signalBand being defined
-- when an item is rendered, so the trajectory_points payload alone is
-- not enough — signal_band has to come through the same RPC.
--
-- Note (2026-05-27 fix): CREATE OR REPLACE FUNCTION cannot change a
-- function's RETURNS TABLE shape; PostgreSQL raises 42P13 ("cannot
-- change return type of existing function"). Since this migration adds
-- two new return columns (signal_band, trajectory_points) to the
-- existing 27-column return shape, we must DROP the function first
-- then CREATE it. Idempotent via DROP IF EXISTS.
--
-- Caller-dependency audit before this drop: get_market_intel_items is
-- only called from JS via supabase.rpc("get_market_intel_items", ...)
-- — no RLS policy, view, or other DB object references it. Safe to
-- drop and recreate.
--
-- After apply: NOTIFY pgrst, 'reload schema' so PostgREST picks up the
-- new return columns.

BEGIN;

DROP FUNCTION IF EXISTS get_market_intel_items(UUID);

CREATE FUNCTION get_market_intel_items(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
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
  signal_band              TEXT,
  trajectory_points        JSONB,
  confidence               TEXT,
  priority                 TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
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
    ii.signal_band,
    ii.trajectory_points,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND s.source_role IN (
      'trade_press',
      'industry_data_provider',
      'vendor_corporate',
      'industry_association'
    )
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
$$;

COMMENT ON FUNCTION get_market_intel_items(UUID) IS
  'Phase 1 routing: returns intelligence_items routed to /market per source_role. Includes trade_press, industry_data_provider, vendor_corporate, industry_association. Sprint 3 A4-2 (2026-05-27): extended return shape with signal_band and trajectory_points so the page can apply the band-gated TrajectoryBars guard. See migration 070 header for the broader routing rationale and migration 107 for the trajectory_points CHECK constraint.';

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema'
