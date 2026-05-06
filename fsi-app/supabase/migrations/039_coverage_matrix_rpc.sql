-- 039_coverage_matrix_rpc.sql
-- W2.D — coverage matrix RPC.
--
-- Returns a pivot of intelligence_items (count + freshness) and active sources
-- across the (jurisdiction_iso × item_type) plane. Each row in the result is a
-- single (jurisdiction × item_type) cell. Cells with zero items but ≥1 active
-- source still appear (FULL OUTER JOIN), sentinel item_type '__no_items__'
-- preserves the row when the jurisdiction has sources but no items at all.
--
-- Depends on:
--   intelligence_items.jurisdiction_iso  (added in 033)
--   sources.jurisdiction_iso             (added in 033)
--
-- STABLE: read-only, no side effects, safe for repeated calls. The admin
-- coverage matrix sub-tab calls this on every refresh.

CREATE OR REPLACE FUNCTION coverage_matrix()
RETURNS TABLE (
  jurisdiction_iso TEXT,
  item_type TEXT,
  item_count INT,
  source_count INT,
  most_recent_item_at TIMESTAMPTZ,
  oldest_item_at TIMESTAMPTZ,
  has_critical BOOLEAN
)
LANGUAGE SQL STABLE AS $$
  WITH item_pivot AS (
    SELECT
      ji AS jurisdiction_iso,
      item_type,
      COUNT(*) AS item_count,
      MAX(created_at) AS most_recent_item_at,
      MIN(created_at) AS oldest_item_at,
      BOOL_OR(priority = 'CRITICAL') AS has_critical
    FROM intelligence_items
    CROSS JOIN LATERAL UNNEST(jurisdiction_iso) AS ji
    GROUP BY ji, item_type
  ),
  source_pivot AS (
    SELECT
      ji AS jurisdiction_iso,
      COUNT(*) AS source_count
    FROM sources
    CROSS JOIN LATERAL UNNEST(jurisdiction_iso) AS ji
    WHERE status = 'active'
    GROUP BY ji
  )
  SELECT
    COALESCE(i.jurisdiction_iso, s.jurisdiction_iso) AS jurisdiction_iso,
    COALESCE(i.item_type, '__no_items__') AS item_type,
    COALESCE(i.item_count, 0)::INT,
    COALESCE(s.source_count, 0)::INT,
    i.most_recent_item_at,
    i.oldest_item_at,
    COALESCE(i.has_critical, FALSE)
  FROM item_pivot i
  FULL OUTER JOIN source_pivot s ON i.jurisdiction_iso = s.jurisdiction_iso;
$$;

COMMENT ON FUNCTION coverage_matrix IS
  'W2.D: Pivot of intelligence_items and active sources by jurisdiction_iso x item_type. STABLE; safe for repeated calls. Used by /admin coverage matrix sub-tab. Items / sources with empty jurisdiction_iso arrays are excluded from the result (no rows are produced for them) — this is the documented behavior; populate the array via the W4 backfill or manual edit to surface the row.';
