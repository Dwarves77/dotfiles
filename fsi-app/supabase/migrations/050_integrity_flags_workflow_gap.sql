-- Migration 050: Widen integrity_flags.category CHECK constraint
-- Adds workflow_gap as a valid category for platform-level integrity flags.
--
-- Rationale: workflow_gap is semantically distinct from surface_concern.
-- workflow_gap = "we need to build this UI/workflow" (e.g., owner assignment,
-- private user notes — features the platform doesn't have at all).
-- surface_concern = "this rendered surface has issues" (e.g., empty tab,
-- missing affordance on existing UI).
--
-- Per agent contract documented in CLAUDE.md, this widens the allowed set
-- without removing existing categories. Idempotent: drops old constraint
-- first, then adds new with widened set.

ALTER TABLE integrity_flags DROP CONSTRAINT IF EXISTS integrity_flags_category_check;

ALTER TABLE integrity_flags ADD CONSTRAINT integrity_flags_category_check
  CHECK (category IN (
    'design_drift',
    'data_quality',
    'source_issue',
    'coverage_gap',
    'data_integrity',
    'surface_concern',
    'workflow_gap'
  ));

-- USER ACTION: apply this migration via Supabase CLI
-- `npx supabase db push` from fsi-app/, or directly via SQL editor.
