-- 231_coverage_gap_backlog_view_section4_fix.sql
-- Session C (coverage discovery lane), 2026-07-17. Fixes 2 routing bugs found while verifying
-- migration 230's acquisition_backlog_v output against the operator's explicit Section 4 roster
-- (Class 6 as built, plus EU 2019/880):
--
-- BUG 1: rank 78 (EU-EPR-remainder collective placeholder, Class 5) was given access_model=
-- 'not_applicable' in migration 230's backfill (the "COLLECTIVE PLACEHOLDER%" pattern was merged
-- into the same value as the Class 6 "PRODUCT-DECISION%" pattern), which put it in Section 4
-- alongside the real product-decision rows -- wrong, it is a Class 5 compliance-reporting-portal
-- placeholder, not a product decision. Reclassified to access_model='free' (national EPR registers
-- are a free-access class; this row records the class exists without individually pricing it).
--
-- BUG 2: rank 16 (EU 2019/880) has disposition='parked' (set in migration 229) but is
-- data_class='instrument' with access_model='free', so the ORIGINAL view logic routed it into
-- Section 1 (FREE-ACQUIRE READY) -- contradicting the operator's explicit instruction that this
-- row belongs in Section 4 with its five-surface test. The view's section-4 gate was keyed on
-- access_model='not_applicable', which only Class 6 rows had; it should be keyed on disposition=
-- 'parked' directly, which is the actual defining feature of a PRODUCT/SCOPE decision row
-- regardless of its data_class or access_model. Corrected below.

UPDATE public.coverage_gap_candidates
SET access_model = 'free'
WHERE rank = 78;

CREATE OR REPLACE VIEW public.acquisition_backlog_v AS
SELECT
  c.*,
  CASE
    WHEN c.disposition = 'declined' THEN NULL
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
  'Consolidation-order backlog, 4 sections per operator ruling 2026-07-17: 1=FREE-ACQUIRE READY (free instruments, the expansion-wave day-one worklist), 2=FREE-INTEGRATE READY (free data feeds/trackers, feeds the feed-intake build unit), 3=OPERATOR SPEND/LICENSE DECISIONS (licensed/mixed, the operator reading list until a review surface builds), 4=PRODUCT/SCOPE DECISIONS (disposition=parked rows carrying a five-surface test: Class 6 enforcement-verification + EU 2019/880). Section 4 is gated on disposition directly, not on access_model, so any future parked row (any data_class) routes correctly. declined rows are excluded from the backlog entirely. Computed, not materialized -- stays live as rows change.';
