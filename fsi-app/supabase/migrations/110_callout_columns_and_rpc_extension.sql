-- Migration 110: callout columns + RPC return-shape extension per
-- SURFACE-MOCKUP-RECONCILE audit findings R-A + M-A
-- (operator-locked 2026-05-27).
--
-- Background: audit 743842c surfaced that ResearchView and MarketPage
-- were built against partial-draft mockups and miss the editorial
-- callout system that appears on every finding/signal card in the
-- full mockups. Operator locked R-A targeted patch + M-A targeted
-- patch, both requiring 4 new optional callout fields:
--
--   whatItChanges      — every card (Research + Market). The editorial
--                        "what this finding changes for your operations"
--                        differentiator.
--   doesNotResolve     — Research featured items only. The "Does NOT
--                        resolve" muted callout naming scope limits.
--   conversionTrigger  — Market featured B1/B2 items. The "Conversion
--                        trigger" muted callout naming the event that
--                        flips the signal from observation to commercial
--                        pressure.
--   crossReferences    — Market featured B3 items. The "Cross-references"
--                        callout linking the corridor signal to canonical
--                        Operations/Regulations briefs.
--
-- All 4 fields are TEXT, NULLABLE. Agent emits them when applicable;
-- parser passes them through; renderer suppresses the callout when null
-- (integrity-preserving silence).
--
-- RPC return shape extension:
--   get_research_items     gains whatItChanges + doesNotResolve
--   get_market_intel_items gains whatItChanges + conversionTrigger
--                          + crossReferences
--
-- Both RPCs were defined in migration 070 with 27-column RETURNS TABLE.
-- get_market_intel_items was extended to 30 columns in migration 108.
-- This migration extends both further.
--
-- CREATE OR REPLACE FUNCTION cannot change RETURNS TABLE shape
-- (42P13). DROP + CREATE used per the 108 precedent. Caller-dependency
-- audit: both RPCs are only called from JS (supabase.rpc(...)), no RLS
-- policy / view / other DB object depends on them. Safe to drop.
--
-- After apply: NOTIFY pgrst, 'reload schema'.

BEGIN;

-- ── Schema: 4 new TEXT columns on intelligence_items ──────────────
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS what_it_changes      TEXT,
  ADD COLUMN IF NOT EXISTS does_not_resolve     TEXT,
  ADD COLUMN IF NOT EXISTS conversion_trigger   TEXT,
  ADD COLUMN IF NOT EXISTS cross_references     TEXT;

COMMENT ON COLUMN intelligence_items.what_it_changes IS
  'Editorial callout (every card, all surfaces): "what this finding/signal changes for your operations". Optional TEXT. Renders as a card right-column block per R-A + M-A mockup.';

COMMENT ON COLUMN intelligence_items.does_not_resolve IS
  'Editorial callout (Research featured items): "Does NOT resolve" muted callout naming scope limits. Optional TEXT.';

COMMENT ON COLUMN intelligence_items.conversion_trigger IS
  'Editorial callout (Market featured B1/B2 items): event that flips the signal from observation to commercial pressure. Optional TEXT.';

COMMENT ON COLUMN intelligence_items.cross_references IS
  'Editorial callout (Market featured B3 corridor items): links to canonical Operations/Regulations briefs. Optional TEXT.';

-- ── get_research_items: extend RETURNS TABLE ──────────────────────
DROP FUNCTION IF EXISTS get_research_items(UUID);

CREATE FUNCTION get_research_items(p_org_id UUID)
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
  confidence               TEXT,
  priority                 TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  what_it_changes          TEXT,
  does_not_resolve         TEXT,
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.what_it_changes, ii.does_not_resolve,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE
    -- Primary category route (covers academic_research, intergovernmental_body
    -- except IMO/ICAO, name-excepted trade_press, name-excepted statistical_data_agency)
    s.category = 'research'
    -- Item-level status conditional overrides (preserved from migration 084 body)
    OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
    OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
END;
$$;

COMMENT ON FUNCTION get_research_items(UUID) IS
  'Phase 1 routing: returns intelligence_items routed to /research per source_role + category. Sprint 3 R-A (2026-05-27): extended return shape with what_it_changes + does_not_resolve callout fields. See migration 070 for routing rationale, migration 110 for the callout extension.';

-- ── get_market_intel_items: extend RETURNS TABLE ──────────────────
-- Already extended in migration 108 with signal_band + trajectory_points
-- (30 columns). Now adding what_it_changes + conversion_trigger +
-- cross_references (33 columns).
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
  what_it_changes          TEXT,
  conversion_trigger       TEXT,
  cross_references         TEXT,
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
    ii.what_it_changes,
    ii.conversion_trigger,
    ii.cross_references,
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
  'Phase 1 routing: returns intelligence_items routed to /market per source_role. Sprint 3 M-A (2026-05-27): extended return shape with what_it_changes + conversion_trigger + cross_references callout fields. Earlier extensions: migration 108 added signal_band + trajectory_points.';

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema'
