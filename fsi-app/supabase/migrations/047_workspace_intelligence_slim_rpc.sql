-- Slim sibling of get_workspace_intelligence for list-view callers.
--
-- The base RPC (defined in 007_full_brief.sql) returns 32 columns including
-- full_brief — a TEXT field averaging ~17 KB and summing to ~3.19 MB across
-- 184 active rows. Surfaces /regulations, /operations, /market render only
-- card metadata (title, tags, priority, jurisdiction, timeline preview) and
-- never read full_brief from this payload, so shipping it on every render
-- is pure wire waste.
--
-- This slim variant has the SAME signature/order MINUS:
--   - full_brief        TEXT  (~3.19 MB / 184 rows — primary win)
--   - operational_impact TEXT (smaller, but never rendered by list views)
--   - open_questions    TEXT[] (never rendered by list views)
--   - reasoning         TEXT  (never rendered by list views)
--
-- Kept (still used by lists): summary (search filter), what_is_it,
-- why_matters, key_data (truncated previews on some surfaces), all
-- jurisdiction/transport/vertical/status/severity/priority/date columns
-- and the workspace-override merge.
--
-- The base RPC stays unchanged and remains the source of truth for the
-- Dashboard home (/) and the regulation detail page (/regulations/[slug]),
-- both of which still consume full_brief.
--
-- Idempotent via CREATE OR REPLACE. RLS / SECURITY DEFINER mirrors the base.

CREATE OR REPLACE FUNCTION get_workspace_intelligence_slim(p_org_id UUID)
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
    ii.added_date DESC;
$$;

COMMENT ON FUNCTION get_workspace_intelligence_slim(UUID) IS
  'List-view sibling of get_workspace_intelligence. Same merge logic, drops full_brief, operational_impact, open_questions, reasoning. Used by /regulations, /operations, /market, /map (any path that does not render full_brief). The Dashboard home and /regulations/[slug] continue to use the full RPC.';
