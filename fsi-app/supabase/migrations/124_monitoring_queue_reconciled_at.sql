-- Migration 124 — monitoring_queue.reconciled_at (reconcile-worker claim marker)
--
-- Date: 2026-06-03
-- Workstream: reconcile loop activation.
--
-- The reconcile worker consumes monitoring_queue rows where change_detected=true. reconciled_at
-- marks a row as processed so the worker is idempotent (does not re-record the same change).
-- Additive + reversible: a new nullable column + a partial index for the worker's claim query.

ALTER TABLE public.monitoring_queue
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- The worker's claim query: change_detected = true AND reconciled_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_monitoring_queue_unreconciled
  ON public.monitoring_queue (checked_at)
  WHERE change_detected = true AND reconciled_at IS NULL;

COMMENT ON COLUMN public.monitoring_queue.reconciled_at IS
  'Migration 124: stamped by the reconcile worker (/api/worker/reconcile) after it processes a change_detected=true row. NULL = pending reconciliation.';
