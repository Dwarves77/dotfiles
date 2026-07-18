-- 237_coverage_gap_backlog_view_watch_condition_fix.sql
-- Session C (coverage discovery lane), 2026-07-18. Fixes a routing bug caught during
-- verification of the final pricing rulings, before reporting the topline: the view's Section-4
-- gate (disposition='parked' AND surface_test IS NOT NULL) does not distinguish two different
-- FLAVORS of "parked" that this bank introduced for the first time:
--
-- (1) A genuine PRODUCT/SCOPE decision parked pending the operator (the original Section 4
--     population: Class 6 rows + EU 2019/880) -- these belong in Section 4.
-- (2) A SPEND decision parked with a revisit-trigger "watch condition" (TAC Index, rank 84) --
--     this is still fundamentally a Section 3 (operator spend/license) row, just with an open
--     decision rather than a closed one; the operator's own framing kept it inside the Section 3
--     discussion ("TAC INDEX: parked with a WATCH condition... the sole loss-material row").
--
-- Without this fix, TAC Index would show up inside "Section 4: Product/Scope Decisions" (wrong --
-- it is not a product or scope question) and Section 4 would incorrectly show 1 open row instead
-- of the 0 the operator's own closing instruction expects ("Section 4 zero open"), since all 4
-- original Section 4 rows are now resolved (2 declined, 2 kept). Distinguished using the
-- watch_condition key already present in TAC's surface_test (added in migration 234) as an
-- honest, already-existing signal rather than adding new schema for a one-row distinction.

CREATE OR REPLACE VIEW public.acquisition_backlog_v AS
SELECT
  c.*,
  CASE
    WHEN c.disposition = 'declined' THEN NULL
    WHEN c.disposition = 'parked' AND c.surface_test IS NOT NULL AND c.surface_test ? 'watch_condition' THEN 3
    WHEN c.disposition = 'parked' AND c.surface_test IS NOT NULL THEN 4
    WHEN c.data_class = 'instrument' AND c.access_model = 'free' THEN 1
    WHEN c.data_class IN ('data_feed', 'tracker') AND c.access_model = 'free' THEN 2
    WHEN c.access_model IN ('licensed', 'mixed') THEN 3
    ELSE NULL
  END AS backlog_section,
  CASE
    WHEN c.transport_mode ILIKE '%air%' THEN 1
    WHEN c.transport_mode ILIKE '%road%' THEN 2
    WHEN c.transport_mode ILIKE '%ocean%' THEN 3
    ELSE 4
  END AS mode_priority_weight,
  CASE
    WHEN c.notes ILIKE '%Operations=IN%' OR c.notes ILIKE '%operations,verdict%IN%' THEN 1
    WHEN c.notes ILIKE '%Market Intel=IN%' THEN 2
    WHEN c.notes ILIKE '%Research=IN%' THEN 3
    ELSE 4
  END AS surface_order_weight
FROM public.coverage_gap_candidates c
WHERE (
  (c.disposition = 'parked' AND c.surface_test IS NOT NULL)
  OR (c.disposition IS DISTINCT FROM 'declined' AND c.disposition IS DISTINCT FROM 'parked' AND c.data_class = 'instrument' AND c.access_model = 'free')
  OR (c.disposition IS DISTINCT FROM 'declined' AND c.disposition IS DISTINCT FROM 'parked' AND c.data_class IN ('data_feed', 'tracker') AND c.access_model = 'free')
  OR (c.disposition IS DISTINCT FROM 'declined' AND c.disposition IS DISTINCT FROM 'parked' AND c.access_model IN ('licensed', 'mixed'))
);

COMMENT ON VIEW public.acquisition_backlog_v IS
  'Consolidation-order backlog, 4 sections per operator rulings 2026-07-17/18: 1=FREE-ACQUIRE READY, 2=FREE-INTEGRATE READY, 3=OPERATOR SPEND/LICENSE DECISIONS (licensed/mixed rows, PLUS parked rows carrying a watch_condition -- an open spend decision, not a product/scope one), 4=PRODUCT/SCOPE DECISIONS (parked rows WITHOUT a watch_condition -- genuine build/scope questions). declined rows are excluded from the backlog entirely. Computed, not materialized -- stays live as rows change.';
