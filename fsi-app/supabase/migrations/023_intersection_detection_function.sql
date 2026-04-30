-- ════════════════════════════════════════════════════════════════════
-- Migration 021 — intersection detection RPC
--
-- Phase B.2.5 platform feature. The agent emits structured tags during
-- regeneration (operational_scenario_tags, compliance_object_tags,
-- related_items, intersection_summary). This function reads those tags
-- and surfaces intersection candidates: pairs of intelligence_items
-- that overlap on operational scenarios AND compliance objects.
--
-- Detection logic:
--   Two items A and B intersect when:
--     1. They share ≥1 operational_scenario_tag, AND
--     2. They share ≥1 compliance_object_tag, AND
--     3. Both are not archived, AND
--     4. They are not the same item (A.id != B.id)
--
-- Strength scoring (rank intersections so reviewers see strongest first):
--   - +3 points per shared operational_scenario_tag
--   - +2 points per shared compliance_object_tag
--   - +5 if A explicitly lists B in related_items (or vice versa)
--   - +2 if A.priority and B.priority are both CRITICAL or HIGH
--
-- Returns one row per intersection (deduplicated so A↔B appears once,
-- not twice as A→B and B→A — sorted by id pair to canonicalize).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION detect_intersections(
  min_strength INT DEFAULT 5,
  max_results INT DEFAULT 100
)
RETURNS TABLE (
  item_a_id UUID,
  item_a_title TEXT,
  item_a_legacy_id TEXT,
  item_a_priority TEXT,
  item_a_intersection_summary TEXT,
  item_b_id UUID,
  item_b_title TEXT,
  item_b_legacy_id TEXT,
  item_b_priority TEXT,
  item_b_intersection_summary TEXT,
  shared_scenarios TEXT[],
  shared_compliance_objects TEXT[],
  explicitly_linked BOOLEAN,
  strength INT
)
LANGUAGE sql
STABLE
AS $$
  WITH pairs AS (
    SELECT
      a.id            AS a_id,
      a.title         AS a_title,
      a.legacy_id     AS a_legacy_id,
      a.priority      AS a_priority,
      a.intersection_summary AS a_intersection_summary,
      a.related_items AS a_related,
      b.id            AS b_id,
      b.title         AS b_title,
      b.legacy_id     AS b_legacy_id,
      b.priority      AS b_priority,
      b.intersection_summary AS b_intersection_summary,
      b.related_items AS b_related,
      ARRAY(
        SELECT UNNEST(a.operational_scenario_tags)
        INTERSECT
        SELECT UNNEST(b.operational_scenario_tags)
      ) AS shared_op,
      ARRAY(
        SELECT UNNEST(a.compliance_object_tags)
        INTERSECT
        SELECT UNNEST(b.compliance_object_tags)
      ) AS shared_co
    FROM intelligence_items a
    JOIN intelligence_items b
      ON a.id < b.id  -- canonicalize ordering, no double-counting
    WHERE a.is_archived = false
      AND b.is_archived = false
      AND COALESCE(array_length(a.operational_scenario_tags, 1), 0) > 0
      AND COALESCE(array_length(b.operational_scenario_tags, 1), 0) > 0
      AND COALESCE(array_length(a.compliance_object_tags, 1), 0) > 0
      AND COALESCE(array_length(b.compliance_object_tags, 1), 0) > 0
  ),
  filtered AS (
    SELECT *
    FROM pairs
    WHERE COALESCE(array_length(shared_op, 1), 0) >= 1
      AND COALESCE(array_length(shared_co, 1), 0) >= 1
  ),
  scored AS (
    SELECT
      a_id, a_title, a_legacy_id, a_priority, a_intersection_summary,
      b_id, b_title, b_legacy_id, b_priority, b_intersection_summary,
      shared_op,
      shared_co,
      (b_id = ANY(a_related) OR a_id = ANY(b_related)) AS explicit,
      (
        3 * COALESCE(array_length(shared_op, 1), 0) +
        2 * COALESCE(array_length(shared_co, 1), 0) +
        CASE WHEN b_id = ANY(a_related) OR a_id = ANY(b_related) THEN 5 ELSE 0 END +
        CASE WHEN a_priority IN ('CRITICAL','HIGH') AND b_priority IN ('CRITICAL','HIGH') THEN 2 ELSE 0 END
      ) AS strength
    FROM filtered
  )
  SELECT
    a_id, a_title, a_legacy_id, a_priority, a_intersection_summary,
    b_id, b_title, b_legacy_id, b_priority, b_intersection_summary,
    shared_op,
    shared_co,
    explicit,
    strength
  FROM scored
  WHERE strength >= min_strength
  ORDER BY strength DESC, a_priority ASC, b_priority ASC
  LIMIT max_results;
$$;

COMMENT ON FUNCTION detect_intersections IS
  'Returns intersection candidates between intelligence_items. Pairs share at least one operational scenario tag AND one compliance object tag. Ranked by strength (3 points per shared scenario + 2 per shared compliance object + 5 if explicitly linked + 2 if both high-priority). Returns canonicalized pairs (A.id < B.id) so each intersection appears exactly once.';
