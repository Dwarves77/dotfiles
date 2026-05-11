-- Aggregates RPC for the workspace intelligence dashboard.
--
-- Background. The dashboard payload (064) caps results at LIMIT 50 — the
-- home subtree only renders the leading priority bucket and a top-5 brief.
-- That cap is correct for row payloads but breaks any UI that derives
-- counts from the row array. As of 2026-05-10 the home dashboard mis-renders:
--
--   - WeeklyBriefing.tsx:92  "Tracking N regulatory resources across M
--                            jurisdictions" — N is `resources.length`,
--                            permanently 50.
--   - DashboardHero.tsx:54   the four CRITICAL/HIGH/MODERATE/LOW tiles
--                            filter the same 50-row array, so the entire
--                            distribution is wrong (Critical reads ~50,
--                            others read 0 because the LIMIT 50 + priority
--                            sort starves the lower buckets).
--   - page.tsx:54            the masthead meta string ("N regulations
--                            tracked · M jurisdictions") shares the same bug.
--
-- Structural fix: separate aggregates from row payloads. This migration
-- introduces get_workspace_intelligence_aggregates(p_org_id) which returns
-- a single jsonb scalar of totals scoped to the same active row set as
-- 064/066 — same workspace_item_overrides merge, same archive filter,
-- BEFORE any LIMIT. The dashboard surfaces fetch {aggregates, rows} in
-- parallel and stop deriving stats from row arrays.
--
-- Scope alignment with 064/066. Both 064 and 066 inline the same active-row
-- filter:
--   intelligence_items ii
--   LEFT JOIN workspace_item_overrides wo
--     ON  wo.item_id = ii.id
--     AND wo.org_id  = p_org_id
--   WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
--
-- Extracting that into a shared SQL function or view would touch 064 and 066,
-- which the operator instructed NOT to modify in this migration. The same
-- filter is therefore inlined here so the aggregates and the dashboard rows
-- describe the same row set by construction. A follow-up refactor PR can
-- factor the duplication into _workspace_intelligence_scope(org_uuid).
--
-- TODO(refactor): extract the active-row filter into a shared SQL function
-- _workspace_intelligence_scope(p_org_id) used by 064, 066, and 068. Defer
-- to a separate PR per the operator's no-modify-064/066 constraint.
--
-- Returned shape:
--   {
--     "total_items": 612,
--     "by_priority": {"CRITICAL": 47, "HIGH": 121, "MODERATE": 280, "LOW": 164},
--     "by_status":   {"in_force": 360, "monitoring": 200, ...},
--     "by_jurisdiction": {"US": 120, "EU": 88, ...},   // unnest(jurisdictions[])
--     "total_jurisdictions": 23,
--     "last_updated_at": "2026-05-10T18:22:00Z"
--   }
--
--   total_items, by_priority, by_status all scope to the SAME active row set
--   as the dashboard RPC (after status/override filters, before any LIMIT).
--   by_priority uses the merged effective_priority (override-or-base), matching
--   what DashboardHero filters on.
--   by_status uses ii.status (the workflow lifecycle column — proposed,
--   adopted, in_force, monitoring, superseded, repealed, expired). Note this
--   is distinct from the archived-vs-active boolean already enforced in the
--   scope filter; aggregating by status is informational for callers that want
--   to break the active set down by lifecycle stage. The scope itself is the
--   active (non-archived-after-overrides) set, so by_status sums to total_items.
--   total_jurisdictions counts DISTINCT non-empty jurisdiction tokens after
--   unnesting the TEXT[] column. by_jurisdiction breaks the same set down by
--   token. last_updated_at = MAX(updated_at) across the scope, used by
--   callers as a cache-invalidation hint.
--
-- Idempotent via CREATE OR REPLACE. SECURITY DEFINER so anon/auth callers
-- can invoke without direct base-table read access (matches 064/066/047/007).
-- No explicit GRANT — mirrors the implicit PUBLIC EXECUTE chain on the
-- existing intelligence RPCs.

CREATE OR REPLACE FUNCTION get_workspace_intelligence_aggregates(p_org_id UUID)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH scope AS (
    -- Same active-row scope as 064/066: items LEFT JOIN this workspace's
    -- overrides, then drop archived-after-overrides. No LIMIT.
    SELECT
      ii.id,
      ii.status,
      ii.jurisdictions,
      ii.updated_at,
      COALESCE(wo.priority_override, ii.priority) AS effective_priority
    FROM intelligence_items ii
    LEFT JOIN workspace_item_overrides wo
      ON  wo.item_id = ii.id
      AND wo.org_id  = p_org_id
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ),
  by_priority AS (
    SELECT effective_priority AS k, COUNT(*)::int AS v
    FROM scope
    GROUP BY effective_priority
  ),
  by_status AS (
    SELECT status AS k, COUNT(*)::int AS v
    FROM scope
    GROUP BY status
  ),
  juris_unnest AS (
    SELECT NULLIF(TRIM(j), '') AS jurisdiction
    FROM scope
    LEFT JOIN LATERAL unnest(scope.jurisdictions) AS j ON TRUE
  ),
  by_jurisdiction AS (
    SELECT jurisdiction AS k, COUNT(*)::int AS v
    FROM juris_unnest
    WHERE jurisdiction IS NOT NULL
    GROUP BY jurisdiction
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM scope) AS total_items,
      (SELECT COUNT(DISTINCT jurisdiction)::int
         FROM juris_unnest
         WHERE jurisdiction IS NOT NULL) AS total_jurisdictions,
      (SELECT MAX(updated_at) FROM scope) AS last_updated_at
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

COMMENT ON FUNCTION get_workspace_intelligence_aggregates(UUID) IS
  'Scalar aggregates over the same active row set as get_workspace_intelligence_dashboard / _listings. Returns total_items, by_priority (effective, override-merged), by_status (lifecycle), by_jurisdiction (unnested TEXT[]), total_jurisdictions, last_updated_at. Used by the dashboard masthead, DashboardHero tiles, and WeeklyBriefing summary so render-time stats no longer derive from the LIMIT-50 row payload. Active-row filter inlined to avoid touching 064/066; TODO refactor into shared _workspace_intelligence_scope(p_org_id).';

-- Mirror the implicit GRANT chain from 007/047/064/066 — no explicit GRANT
-- EXECUTE; SECURITY DEFINER + default PUBLIC EXECUTE handles caller access.
