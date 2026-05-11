-- Scoped sibling of get_workspace_intelligence_aggregates (068).
--
-- Background. Migration 068 returns workspace-wide totals for the dashboard
-- masthead and DashboardHero tiles. The /market, /research, /operations
-- pages each render a NARROW slice of the same workspace (item_type IN (...)
-- or domain IN (...)). Reusing 068's totals on those pages mis-counts the
-- scope: e.g., a user on /operations sees "612 items in scope" when the
-- page only renders the ~51 regional_data + facility items.
--
-- This migration adds get_workspace_intelligence_aggregates_scoped, which
-- accepts an optional p_scope_filter jsonb argument with the shape:
--   { "item_types": ["regional_data", ...], "domains": [3, 6] }
-- Both keys are optional. When both are present they OR together (an item
-- matches if its item_type is in the array OR its domain is in the array),
-- mirroring the client-side filter the page components already apply
-- (see OperationsPage.tsx and MarketPage.tsx). When p_scope_filter is NULL
-- or empty the function degrades to the same workspace-wide scope as 068.
--
-- Why a sibling RPC instead of extending 068?
--   - 068 is in production and called by /. Extending it with an optional
--     parameter changes the function signature; PostgREST disambiguates by
--     argument names but Supabase clients cache RPC schemas and can pin the
--     wrong overload after a redeploy. A separate function name is the
--     least-risky path.
--   - Three /market /research /operations pages pull aggregates with
--     different scope filters; a single sibling RPC handles all three.
--
-- Returned shape: identical to 068 but the scope is reduced.
--
-- Idempotent via CREATE OR REPLACE. SECURITY DEFINER mirrors 068 / 047 /
-- 064 / 066. Inlines the same active-row filter as 068 — the TODO to
-- factor a shared _workspace_intelligence_scope(p_org_id) carries over.
--
-- Author: 2026-05-10 fix/market-research-operations-framework-parity

CREATE OR REPLACE FUNCTION get_workspace_intelligence_aggregates_scoped(
  p_org_id        UUID,
  p_scope_filter  JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH scope AS (
    SELECT
      ii.id,
      ii.status,
      ii.jurisdictions,
      ii.updated_at,
      ii.item_type,
      ii.domain,
      COALESCE(wo.priority_override, ii.priority) AS effective_priority
    FROM intelligence_items ii
    LEFT JOIN workspace_item_overrides wo
      ON  wo.item_id = ii.id
      AND wo.org_id  = p_org_id
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ),
  filtered AS (
    -- When p_scope_filter is NULL or has neither key, pass through.
    -- Otherwise an item matches if its item_type is in item_types[] OR
    -- its domain is in domains[] (OR semantics, mirroring page filters).
    SELECT *
    FROM scope
    WHERE
      p_scope_filter IS NULL
      OR (
        (p_scope_filter ? 'item_types' OR p_scope_filter ? 'domains')
        AND (
          (p_scope_filter ? 'item_types'
           AND scope.item_type = ANY(
             SELECT jsonb_array_elements_text(p_scope_filter -> 'item_types')
           ))
          OR
          (p_scope_filter ? 'domains'
           AND scope.domain = ANY(
             SELECT (jsonb_array_elements_text(p_scope_filter -> 'domains'))::int
           ))
        )
      )
      OR (
        -- Edge case: object passed but with no item_types or domains keys.
        -- Treat as no filter.
        NOT (p_scope_filter ? 'item_types')
        AND NOT (p_scope_filter ? 'domains')
      )
  ),
  by_priority AS (
    SELECT effective_priority AS k, COUNT(*)::int AS v
    FROM filtered
    GROUP BY effective_priority
  ),
  by_status AS (
    SELECT status AS k, COUNT(*)::int AS v
    FROM filtered
    GROUP BY status
  ),
  juris_unnest AS (
    SELECT NULLIF(TRIM(j), '') AS jurisdiction
    FROM filtered
    LEFT JOIN LATERAL unnest(filtered.jurisdictions) AS j ON TRUE
  ),
  by_jurisdiction AS (
    SELECT jurisdiction AS k, COUNT(*)::int AS v
    FROM juris_unnest
    WHERE jurisdiction IS NOT NULL
    GROUP BY jurisdiction
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM filtered) AS total_items,
      (SELECT COUNT(DISTINCT jurisdiction)::int
         FROM juris_unnest
         WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
      (SELECT MAX(updated_at) FROM filtered) AS last_updated_at
  )
  SELECT jsonb_build_object(
    'total_items',         (SELECT total_items FROM totals),
    'by_priority',         COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_priority),
                             '{}'::jsonb
                           ),
    'by_status',           COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_status),
                             '{}'::jsonb
                           ),
    'by_jurisdiction',     COALESCE(
                             (SELECT jsonb_object_agg(k, v) FROM by_jurisdiction),
                             '{}'::jsonb
                           ),
    'total_jurisdictions', (SELECT total_jurisdictions FROM totals),
    'last_updated_at',     (SELECT last_updated_at FROM totals)
  );
$$;

COMMENT ON FUNCTION get_workspace_intelligence_aggregates_scoped(UUID, JSONB) IS
  'Scoped sibling of get_workspace_intelligence_aggregates (068). Accepts optional p_scope_filter jsonb of shape {item_types: text[], domains: int[]} and reduces the active-row scope to items matching item_type ∈ item_types OR domain ∈ domains. Used by /market, /research, /operations to populate masthead meta + StatStrip with true totals scoped to the page surface, mirroring the page-level client filters. NULL or empty filter degrades to workspace-wide aggregates equivalent to 068.';
