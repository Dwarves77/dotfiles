-- 036_admin_notifications_rpc.sql
--
-- W2.E: Aggregated admin-attention RPC. Returns a single row of counts
-- across all needs-attention categories surfaced in the platform admin
-- shell (sidebar red dot + admin homepage Issues Queue).
--
-- STABLE function (read-only, no side effects). Sibling-migration column
-- references:
--   - staged_updates.materialization_error / materialized_at  → migration 034 (W1.B)
--   - intelligence_items.agent_integrity_flag /
--     agent_integrity_resolved_at                              → migration 035 (W2.C)
-- Migrations apply in numeric order, so by the time 036 runs both 034
-- and 035 are present. CREATE FUNCTION binds column references at call
-- time (not definition time) for SQL functions, so the RPC stays valid
-- even before its callers are wired in.
--
-- Two slots return 0 today and will be populated by W1.C (source
-- attribution materialized view) and W2.D (coverage matrix). Keeping
-- the API stable now lets the frontend ship its red dot + Issues Queue
-- against the final shape and pick up the new signals automatically
-- when the sibling migrations replace the literal 0s.

CREATE OR REPLACE FUNCTION admin_attention_counts()
RETURNS TABLE (
  provisional_sources_pending INT,
  staged_updates_pending INT,
  staged_updates_materialization_failed INT,
  integrity_flags_unresolved INT,
  source_attribution_mismatches INT,
  auto_approved_awaiting_spotcheck INT,
  coverage_gaps_critical INT,
  total INT
)
LANGUAGE SQL STABLE AS $$
  WITH counts AS (
    SELECT
      (SELECT COUNT(*)::INT FROM provisional_sources WHERE status = 'pending_review') AS provisional_sources_pending,
      (SELECT COUNT(*)::INT FROM staged_updates WHERE status = 'pending') AS staged_updates_pending,
      (SELECT COUNT(*)::INT FROM staged_updates
        WHERE status = 'approved'
          AND materialized_at IS NULL
          AND materialization_error IS NOT NULL) AS staged_updates_materialization_failed,
      (SELECT COUNT(*)::INT FROM intelligence_items
        WHERE agent_integrity_flag = TRUE
          AND agent_integrity_resolved_at IS NULL) AS integrity_flags_unresolved,
      0 AS source_attribution_mismatches,  -- populated by W1.C-built materialized view in follow-up
      (SELECT COUNT(*)::INT FROM sources
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND COALESCE(spotchecked, FALSE) = FALSE) AS auto_approved_awaiting_spotcheck,
      0 AS coverage_gaps_critical  -- populated by W2.D follow-up
  )
  SELECT
    provisional_sources_pending,
    staged_updates_pending,
    staged_updates_materialization_failed,
    integrity_flags_unresolved,
    source_attribution_mismatches,
    auto_approved_awaiting_spotcheck,
    coverage_gaps_critical,
    (provisional_sources_pending
     + staged_updates_pending
     + staged_updates_materialization_failed
     + integrity_flags_unresolved
     + source_attribution_mismatches
     + auto_approved_awaiting_spotcheck
     + coverage_gaps_critical) AS total
  FROM counts;
$$;

COMMENT ON FUNCTION admin_attention_counts() IS
  'W2.E: Aggregated admin-attention counts across all needs-attention categories. Polled by the admin sidebar red-dot hook every 60s when the admin window is visible. Two slots (source_attribution_mismatches, coverage_gaps_critical) return 0 pending W1.C / W2.D follow-up wiring.';

-- Spot-check queue: sources auto-approved by the agent (or imported in
-- bulk) need a human eyeball pass within the 7-day window. The flag
-- here is the "this row has been reviewed" marker so the same source
-- never re-appears in the queue after spot-check.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS spotchecked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS spotchecked_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS spotchecked_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN sources.spotchecked IS
  'W2.E: Marks a source as having been spot-checked by a platform admin. Sources with spotchecked=FALSE created within the last 7 days are surfaced in the auto_approved_awaiting_spotcheck queue.';

-- Partial index keeps the spotcheck-queue subquery O(unchecked) instead
-- of scanning the full sources table on every poll.
CREATE INDEX IF NOT EXISTS idx_sources_awaiting_spotcheck
  ON sources(created_at)
  WHERE spotchecked = FALSE;
