-- Migration 140: admin_attention_counts() — surface the PLATFORM integrity_flags backlog.
--
-- BUG (flag a, operator 2026-06-15). The admin Issues Queue + sidebar red-dot are driven by
-- admin_attention_counts() (migration 036). Its `integrity_flags_unresolved` slot counts ONLY the
-- per-brief signal intelligence_items.agent_integrity_flag (migration 035). It is BLIND to the
-- platform-level integrity_flags table (migration 048) — the data_quality / data_integrity quarantine
-- flags the provenance trigger + audits raise. As of 2026-06-15 the queue reported 3 (per-brief) while
-- 523 platform flags sat open and unsurfaced. The operator's find-quarantined attention path must see them.
--
-- FIX. Add a new count column `platform_integrity_flags_open` = open + in_review rows in integrity_flags,
-- and include it in `total` so the red-dot reflects the real attention backlog. ADDITIVE: the existing 7
-- columns are byte-identical; callers that ignore the new column keep working, and the route/hook/IssuesQueue
-- are updated in the same change to render it (targetTab = platform-integrity-flags).
--
-- 'open' + 'in_review' matches PlatformIntegrityFlagsView's default scope (the route's
-- getPlatformFlags default filter), so the queue count and the tab list agree.
-- STABLE / read-only function; no data mutation, no backfill.
--
-- Adding a column to RETURNS TABLE changes the function's return type, which CREATE OR REPLACE cannot
-- do — so DROP then CREATE inside one transaction (no window where the RPC is absent).

BEGIN;

DROP FUNCTION IF EXISTS admin_attention_counts();

CREATE OR REPLACE FUNCTION admin_attention_counts()
RETURNS TABLE (
  provisional_sources_pending INT,
  staged_updates_pending INT,
  staged_updates_materialization_failed INT,
  integrity_flags_unresolved INT,
  platform_integrity_flags_open INT,
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
      (SELECT COUNT(*)::INT FROM integrity_flags
        WHERE status IN ('open', 'in_review')) AS platform_integrity_flags_open,
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
    platform_integrity_flags_open,
    source_attribution_mismatches,
    auto_approved_awaiting_spotcheck,
    coverage_gaps_critical,
    (provisional_sources_pending
     + staged_updates_pending
     + staged_updates_materialization_failed
     + integrity_flags_unresolved
     + platform_integrity_flags_open
     + source_attribution_mismatches
     + auto_approved_awaiting_spotcheck
     + coverage_gaps_critical) AS total
  FROM counts;
$$;

COMMENT ON FUNCTION admin_attention_counts() IS
  'Aggregated admin-attention counts (migration 036, +platform_integrity_flags_open in 140). Polled by the admin sidebar red-dot + Issues Queue. platform_integrity_flags_open counts open+in_review rows in the platform integrity_flags table (migration 048) — previously unsurfaced. Two slots (source_attribution_mismatches, coverage_gaps_critical) still return 0 pending W1.C / W2.D.';

COMMIT;
