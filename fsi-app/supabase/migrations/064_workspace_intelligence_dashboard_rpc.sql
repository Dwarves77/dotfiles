-- Dashboard projection sibling of get_workspace_intelligence.
--
-- The base RPC (007_full_brief.sql) returns 32 columns including the four
-- heavy long-text fields documented in 047:
--   full_brief, operational_impact, open_questions, reasoning
-- The slim sibling (047_workspace_intelligence_slim_rpc.sql) drops those
-- four. /regulations, /operations, /market, /map, /settings already use
-- slim because they never render the dropped fields.
--
-- The dashboard route /, however, still calls the FULL RPC. Per
-- docs/dashboard-payload-audit-2026-05-11.md the home subtree
-- (DashboardHero, HomeSurface, WeeklyBriefing, WhatChanged, Supersessions,
-- DashboardByOwner, DashboardCoverageGaps, DashboardWatchlist,
-- DashboardAwaitingReview) renders ZERO references to:
--   summary, what_is_it, why_matters, key_data, full_brief, reasoning
-- (`grep -rn "fullBrief" src/components/home/` returns 0 hits, the other
-- five are likewise unused on /). The 184-row payload ships ~3.19 MB of
-- full_brief plus ~300-500 KB across the other five long-text columns
-- on every / render today, all of it unrendered, pure wire waste.
--
-- This dashboard variant has the same merge logic as slim and additionally
-- drops:
--   - summary       TEXT  (used as Resource.note on list surfaces, dashboard does not render it)
--   - what_is_it    TEXT
--   - why_matters   TEXT
--   - key_data      TEXT[]
--   - reasoning     TEXT
-- on top of the four slim already drops. It also caps results at LIMIT 50,
-- since the dashboard hero counts and WeeklyBriefing top-5 surface only
-- the leading priority bucket and never paginates beyond the visible top.
--
-- Idempotent via CREATE OR REPLACE. RLS / SECURITY DEFINER mirrors slim.

CREATE OR REPLACE FUNCTION get_workspace_intelligence_dashboard(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
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
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
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
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC
  LIMIT 50;
$$;

COMMENT ON FUNCTION get_workspace_intelligence_dashboard(UUID) IS
  'Dashboard-only sibling of get_workspace_intelligence. Same merge logic as slim, additionally drops summary, what_is_it, why_matters, key_data, reasoning, and caps to LIMIT 50 for the home hero + top-of-list rendering. Used exclusively by app/page.tsx via fetchDashboardData. Other surfaces continue to use slim or full as appropriate.';

-- Mirror the implicit GRANT chain from the base + slim RPCs. Neither
-- 007_full_brief.sql nor 047_workspace_intelligence_slim_rpc.sql issues
-- explicit GRANT EXECUTE statements, so callers reach these via the
-- default PUBLIC EXECUTE on SECURITY DEFINER functions. Mirror that
-- exactly here, no additional GRANT, to keep behavior identical.
