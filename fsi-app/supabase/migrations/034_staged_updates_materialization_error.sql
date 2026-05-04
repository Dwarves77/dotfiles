-- 034_staged_updates_materialization_error.sql
--
-- W1.B: staged_updates approval-pipeline observability columns.
--
-- The approval handler previously flipped staged_updates.status to 'approved'
-- BEFORE attempting to materialize the corresponding intelligence_items row.
-- When the INSERT failed (schema mismatch, missing required field, RLS, etc.)
-- the staged_update was already 'approved' with no surviving error trail and
-- no intelligence_items row produced. We have 24 such orphans in production.
--
-- These columns let the handler record the failure reason instead of silently
-- swallowing it, and let the audit script + W4 backfill pipeline find unmaterialized
-- approvals quickly via a partial index.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so safe to re-apply.

ALTER TABLE staged_updates
  ADD COLUMN IF NOT EXISTS materialization_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS materialized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS materialized_item_id UUID NULL REFERENCES intelligence_items(id) ON DELETE SET NULL;

-- Partial index: lets audit script + W4 backfill find unmaterialized approvals
-- in O(orphan_count) instead of scanning the full staged_updates table.
CREATE INDEX IF NOT EXISTS idx_staged_updates_unmaterialized
  ON staged_updates(status, materialized_at)
  WHERE status = 'approved' AND materialized_at IS NULL;

COMMENT ON COLUMN staged_updates.materialization_error IS
  'Non-null when an approved staged_update failed to insert into its target table. Populated by /api/staged-updates POST handler.';
COMMENT ON COLUMN staged_updates.materialized_at IS
  'Timestamp at which the approval successfully wrote the corresponding row(s). NULL for unmaterialized approvals.';
COMMENT ON COLUMN staged_updates.materialized_item_id IS
  'For update_type=new_item only: the intelligence_items.id produced by approval. NULL for other update_types or failed materialization.';
