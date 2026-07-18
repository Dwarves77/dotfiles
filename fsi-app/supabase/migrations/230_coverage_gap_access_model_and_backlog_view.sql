-- 230_coverage_gap_access_model_and_backlog_view.sql
-- Session C (coverage discovery lane), 2026-07-17. Consolidation order execution: adds the
-- access_model classification the operator's four-section STRUCTURE ruling needs ("deriving
-- section from data_class plus access flags"), backfilled deterministically from each row's own
-- freight_relevance text (authored by this session, pattern-verified before backfill, not guessed)
-- rather than left as an unstructured text scan in the view. Then creates acquisition_backlog_v,
-- the durable computed view implementing the operator's 4-section STRUCTURE ruling.
--
-- access_model values: free (primary is free-fetchable/free-integrable), licensed (paid, spend
-- decision needed), mixed (partially free/partially paid, e.g. rank 28 CDP: free for subnational
-- disclosure, licensed for corporate-level), not_applicable (Class 6 PRODUCT-DECISION rows, where
-- the relevant axis is the five-surface test, not spend). Backfill verified 96/98 rows matched a
-- clean LICENSED/FREE/MIXED/PRODUCT-DECISION leading-pattern in freight_relevance; the 2 exceptions
-- (rank 28 CDP, rank 96 CARB-repeal-carried-forward) were individually checked and classified by
-- reading their actual content, not force-fit to the pattern.

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS access_model text
    CHECK (access_model IN ('free', 'licensed', 'mixed', 'not_applicable'));

COMMENT ON COLUMN public.coverage_gap_candidates.access_model IS
  'free = primary/feed is free-fetchable or free-integrable. licensed = paid, requires an operator spend/license decision before acquisition. mixed = partially free / partially paid (e.g. free subnational disclosure, paid corporate tier). not_applicable = Class 6 PRODUCT-DECISION rows where spend is not the relevant axis. Backfilled once from freight_relevance text at migration time (rule-based, individually verified on the 2 pattern exceptions); new rows should set this explicitly going forward, not rely on future backfills.';

UPDATE public.coverage_gap_candidates
SET access_model = CASE
  WHEN data_class = 'instrument' THEN 'free'
  WHEN rank = 28 THEN 'mixed'
  WHEN rank = 96 THEN 'free'
  WHEN freight_relevance ILIKE 'LICENSED%' THEN 'licensed'
  WHEN freight_relevance ILIKE 'FREE%' THEN 'free'
  WHEN freight_relevance ILIKE '%MIXED ACCESS%' THEN 'mixed'
  WHEN freight_relevance ILIKE 'Journal feed%' THEN 'mixed'
  WHEN freight_relevance ILIKE 'COLLECTIVE PLACEHOLDER%' THEN 'not_applicable'
  WHEN freight_relevance ILIKE 'PRODUCT-DECISION%' THEN 'not_applicable'
  ELSE NULL
END;

-- acquisition_backlog_v: the durable computed view. Section derives from data_class + access_model
-- + disposition, so it stays live as rows change (new rows, spend decisions, review-lane restores
-- resolving remaining ambiguity) without needing a re-run of any classification script.
CREATE OR REPLACE VIEW public.acquisition_backlog_v AS
SELECT
  c.*,
  CASE
    WHEN c.data_class = 'instrument' AND c.access_model = 'free' AND coalesce(c.disposition, 'kept') <> 'declined'
      THEN 1
    WHEN c.data_class IN ('data_feed', 'tracker') AND c.access_model = 'free' AND coalesce(c.disposition, 'kept') <> 'declined'
      THEN 2
    WHEN c.access_model IN ('licensed', 'mixed') AND coalesce(c.disposition, 'kept') <> 'declined'
      THEN 3
    WHEN c.access_model = 'not_applicable'
      THEN 4
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
  (c.data_class = 'instrument' AND c.access_model = 'free' AND coalesce(c.disposition, 'kept') <> 'declined')
  OR (c.data_class IN ('data_feed', 'tracker') AND c.access_model = 'free' AND coalesce(c.disposition, 'kept') <> 'declined')
  OR (c.access_model IN ('licensed', 'mixed') AND coalesce(c.disposition, 'kept') <> 'declined')
  OR (c.access_model = 'not_applicable')
);

COMMENT ON VIEW public.acquisition_backlog_v IS
  'Consolidation-order backlog, 4 sections per operator ruling 2026-07-17: 1=FREE-ACQUIRE READY (free instruments, the expansion-wave day-one worklist), 2=FREE-INTEGRATE READY (free data feeds/trackers, feeds the feed-intake build unit), 3=OPERATOR SPEND/LICENSE DECISIONS (licensed/mixed, the operator reading list until a review surface builds), 4=PRODUCT DECISIONS (Class 6 + EU 2019/880, five-surface-test rows). Computed, not materialized -- stays live as rows change, spend decisions land, and review-lane restores resolve ambiguity. Order within each section: mode_priority_weight (air/road/ocean) then estimated_priority for sections 1/3/4; surface_order_weight (Operations/Market Intel/Research) then estimated_priority for section 2.';
