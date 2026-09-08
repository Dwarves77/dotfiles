-- Migration 314: admin_attention_counts() counts the provisional queue AS RENDERED.
--
-- PRODUCTION DEFECT (click-through audit of carosledge.com, 2026-09-08, /admin). One screen showed
-- three numbers for one queue: the Sources tab badge said 489, the issues queue row "Provisional
-- sources pending review" said 489, and the table header directly above the rows said "491 PENDING",
-- with 491 Approve buttons in the DOM.
--
-- ROOT CAUSE [CONFIRMED against the live database, 2026-09-08]:
--   SELECT status, count(*) FROM provisional_sources GROUP BY status
--     -> pending_review 489, needs_more_data 2, confirmed 6.
-- `fetchProvisionalSources` (src/lib/supabase-server.ts) selects status IN
-- ('pending_review','needs_more_data') and the table header prints its own row count, so the table
-- said 491. This function counted `status = 'pending_review'` alone (migration 140, line 41), so
-- every badge said 489. Two populations, one word, one screen.
--
-- WHICH IS RIGHT: the table. A `needs_more_data` row is still awaiting an operator decision and the
-- surface offers it the same three decisions (approve / reject / re-tier). The badge is what was
-- counting the wrong set, so the count moves to the queue, not the queue to the count.
--
-- THE VOCABULARY HAS ONE HOME: src/lib/admin/provisional-review-queue.ts's
-- PROVISIONAL_REVIEW_STATUSES. That module's header cites this migration and this migration cites
-- it, so a future change to one has to see the other. A source-level proof pins the pair:
-- src/lib/admin/provisional-review-queue.npmtest.mjs.
--
-- ADDITIVE / read-only: the return type is byte-identical to migration 140's, only the
-- provisional_sources_pending expression changes (and `total` with it, correctly, since `total` is
-- the sum of these slots). CREATE OR REPLACE suffices; no DROP, so there is no window where the RPC
-- is absent. search_path stays pinned per migration 160.

BEGIN;

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
LANGUAGE SQL STABLE
SET search_path = public, extensions, pg_temp
AS $$
  WITH counts AS (
    SELECT
      -- COUNTS-61: the SAME two statuses src/lib/admin/provisional-review-queue.ts names and
      -- fetchProvisionalSources selects, so the badge and the table it labels can never disagree.
      (SELECT COUNT(*)::INT FROM provisional_sources
        WHERE status IN ('pending_review', 'needs_more_data')) AS provisional_sources_pending,
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
  'Aggregated admin-attention counts (migration 036, +platform_integrity_flags_open in 140, provisional queue population corrected in 314). Polled by the admin sidebar red-dot + Issues Queue. provisional_sources_pending counts status IN (pending_review, needs_more_data) — the SAME population fetchProvisionalSources renders and src/lib/admin/provisional-review-queue.ts names; counting pending_review alone made the badge read 489 over a table header reading 491 PENDING. Two slots (source_attribution_mismatches, coverage_gaps_critical) still return 0 pending W1.C / W2.D.';

COMMIT;
