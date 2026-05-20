-- Migration 097: D1 Option B retroactive retune.
--
-- Per operator decision (D1 Option B, 2026-05-20): the Q4 bias-tag auto-
-- confidence threshold becomes per-dimension. methodology stays at 0.80
-- (judgment-call tags requiring methodology examination; operator-in-loop
-- appropriate). funding + stakeholder bump to 0.75 (usually clearer from
-- institutional context; classifier was unnecessarily conservative).
--
-- This migration retroactively promotes existing source_bias_tags rows
-- that meet the new thresholds. Rows where:
--   dimension IN ('funding', 'stakeholder')
--   AND confidence >= 0.75
--   AND assignment_source = 'haiku_proposed_low_confidence'
-- are promoted to 'haiku_auto_high_confidence'.
--
-- Per the D1 investigation, this should shift ~150 review-queue rows to
-- auto-applied, draining the review queue from ~524 rows / ~249 unique
-- sources to ~375 rows / ~150 unique sources. methodology tags stay in
-- the review queue at their 0.80 threshold per Option B.
--
-- Rationale + tradeoffs in docs/sprint-1/followups.md OBS-52 (deferred
-- methodology classifier prompt refinement).
--
-- The classifier script (fsi-app/scripts/q4-bias-batch-assign.mjs) was
-- updated in the same commit to use per-dimension thresholds for future
-- classifications. This migration only handles existing data.

UPDATE public.source_bias_tags
SET assignment_source = 'haiku_auto_high_confidence'
WHERE assignment_source = 'haiku_proposed_low_confidence'
  AND dimension IN ('funding', 'stakeholder')
  AND confidence >= 0.75;
