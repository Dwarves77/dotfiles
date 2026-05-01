-- 026_research_pipeline_stage.sql
-- Phase C Block A — research surface prep.
--
-- Adds pipeline_stage column to intelligence_items so the Research surface
-- (design_handoff_2026-04/preview/research.html) can filter items by
-- editorial pipeline stage:
--   draft          — internal, researcher building the file
--   active_review  — awaiting validator sign-off
--   published      — live in customer-facing intelligence surfaces
--   archived       — superseded or out-of-scope
--
-- Existing 155 rows are already serving content in production, so the
-- backfill sets them all to 'published'. New rows default to NULL and
-- pipeline-aware code paths must handle NULL as "unstaged" (typically
-- treated as published for read paths, draft for editor write paths).

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NULL;

ALTER TABLE intelligence_items
  ADD CONSTRAINT intelligence_items_pipeline_stage_check
  CHECK (pipeline_stage IS NULL OR pipeline_stage IN ('draft', 'active_review', 'published', 'archived'));

-- Backfill: existing rows are already serving content
UPDATE intelligence_items
  SET pipeline_stage = 'published'
  WHERE pipeline_stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_intelligence_items_pipeline_stage
  ON intelligence_items(pipeline_stage);

COMMENT ON COLUMN intelligence_items.pipeline_stage IS
  'Editorial pipeline stage. Values: draft, active_review, published, archived. Backfilled to published for legacy rows. NULL on new rows means unstaged.';
