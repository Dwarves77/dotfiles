-- Listings projection sibling of get_workspace_intelligence.
--
-- Sequence so far:
--   007 full RPC (32 cols, including full_brief ~17 KB/row, ~3.19 MB total
--                 across 184 active rows). Detail surfaces only.
--   047 slim RPC drops the four heaviest long-text columns:
--                 full_brief, operational_impact, open_questions, reasoning.
--                 Used by /regulations, /operations, /market, /map, /settings.
--   064 dashboard RPC drops slim's set + summary, what_is_it, why_matters,
--                 key_data, capped LIMIT 50. Home / only.
--                 (summary RETAINED for WeeklyBriefing + WhatChanged subtitles
--                 was a deliberate dashboard call, see 064 header.)
--   065 wave 1b pending_first_fetch queue (unrelated, ingestion track).
--
-- Operator measurement (2026-05-10) showed /regulations, /market, /operations,
-- /map each still ship ~690 KB RSC payloads after PR #90, with ~209 KB per
-- route attributable to the `summary` TEXT column (mapped to Resource.note in
-- the supabase-server loader) across 454 records. The per-route audit found:
--
--   /regulations  -- summary used only inside the search hay-stack
--                    (RegulationsSurface.tsx line 423: ${r.note} concat into
--                    the lowercase search target). Card body never renders
--                    note. Safe to drop summary IF the search query loses
--                    the note contribution; titles, tags, whatIsIt, whyMatters,
--                    jurisdiction continue to participate.
--   /map          -- no `r.note` reference anywhere in MapPageView, MapView,
--                    or jurisdictionCentroids. Safe to drop summary outright.
--   /market       -- MarketPage.tsx renders it.note inside Key-items cards
--                    (lines 387-389), PriceRow body (lines 423-426), and the
--                    Why-this-matters fallback (line 452: whyMatters || note).
--                    Cards visibly regress without note.
--   /operations   -- OperationsPage.tsx renders head.note (line 496), it.note
--                    inside the per-region item list (line 703), and uses note
--                    in the chip-key inference text scan (line 82). Cards
--                    visibly regress and the chip filter loses signal without
--                    note.
--
-- The two consumers that MUST keep summary stay on slim. The two that can
-- safely drop summary switch to this listings RPC. The wire savings come from
-- the ~209 KB per route observation: dropping summary alone is the heaviest
-- remaining trim short of pruning what_is_it / why_matters / key_data, which
-- list views still surface (whyMatters fallback, key_data preview chips).
--
-- This listings variant has the same merge logic as slim and additionally
-- drops:
--   - summary       TEXT  (~209 KB / 454 rows per route, the big remaining win)
--
-- on top of the four slim already drops. NO LIMIT (callers paginate /
-- filter / sort over the full active set, unlike the dashboard hero's
-- top-50 LIMIT). Same SECURITY DEFINER, same workspace override merge,
-- same ORDER BY priority bucket then added_date DESC.
--
-- Idempotent via CREATE OR REPLACE. RLS / SECURITY DEFINER mirrors slim.

CREATE OR REPLACE FUNCTION get_workspace_intelligence_listings(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
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

COMMENT ON FUNCTION get_workspace_intelligence_listings(UUID) IS
  'Listings sibling of get_workspace_intelligence. Same merge logic as slim, additionally drops summary. Used by /regulations and /map (loaders that never render summary on cards). /market and /operations stay on slim because their card bodies render summary (mapped to Resource.note); switching them needs a card refactor or a per-route summary retention. NO LIMIT (callers paginate / filter / sort across the full active set).';

-- Mirror the implicit GRANT chain from 007 / 047 / 064: none of those
-- migrations issue explicit GRANT EXECUTE statements, callers reach the
-- functions via the default PUBLIC EXECUTE on SECURITY DEFINER. Mirror that
-- exactly here, no additional GRANT, to keep behavior identical.
