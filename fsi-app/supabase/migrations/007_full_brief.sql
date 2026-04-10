-- Add full_brief column for skill-standard intelligence briefs
-- This is the primary content field — rich markdown regulatory playbooks
-- whatIsIt/whyMatters/keyData remain as card preview summaries

ALTER TABLE intelligence_items ADD COLUMN IF NOT EXISTS full_brief TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS full_brief TEXT;
ALTER TABLE staged_updates ADD COLUMN IF NOT EXISTS full_brief TEXT;

-- Update the RPC function to include full_brief
CREATE OR REPLACE FUNCTION get_workspace_intelligence(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
  full_brief               TEXT,
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
    ii.full_brief,
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
