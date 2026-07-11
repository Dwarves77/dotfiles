-- Migration 167 (Wave-α Track B4) — add the phantom staged_updates.reviewer_notes column
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW. Authored, apply via the DDL protocol — DO NOT apply inline.
-- (Additive nullable column; low-risk, but batched with the Track-B window per ADR-011.)
--
-- WHY (master-gap-register P1 #5; DB-3 F15; X.1(b) row 2):
--   `api/staged-updates/route.ts` writes `reviewer_notes` conditionally on both the reject path (:170) and
--   the approve path (:208) — but the column has NEVER existed in any migration (grep over all migrations
--   confirms). With notes on APPROVE the failure is severe: applyUpdate materializes the item FIRST, then
--   the status-persist UPDATE (which includes reviewer_notes) fails "column does not exist" → the route
--   returns 500 with status left 'pending' and a live materialized item — and because the :144 idempotency
--   guard keys on `materialized_at` (still NULL), a retry re-runs applyUpdate → duplicate mint. Latent only
--   because all 24 historic approvals passed no notes.
--
-- FIX: add the column (text, nullable). The approve/reject flow already writes it; once it exists the
--   status-persist succeeds, materialized_at + materialized_item_id get stamped, and the idempotency guard
--   fires on retry. Paired in the SAME dispatch: an idempotency hardening in the approve path (route.ts)
--   and a one-off disposition of the single stuck orphan row (scripts/_wave-alpha/b4-disposition-stuck-staged-update.mjs).
--
-- POST-APPLY PROOF (see track-b-proofs.md B4):
--   * information_schema.columns shows staged_updates.reviewer_notes text, is_nullable YES.
--   * A dry-run approve-with-notes against a test staged row persists reviewer_notes + materialized_at
--     without a 500 (exercised in staging, not prod).
-- Reversible: rollbacks/167_staged_updates_reviewer_notes_rollback.sql (DROP COLUMN).

BEGIN;

ALTER TABLE public.staged_updates
  ADD COLUMN IF NOT EXISTS reviewer_notes text NULL;

COMMENT ON COLUMN public.staged_updates.reviewer_notes IS
  'Optional free-text reviewer note captured on approve/reject via /api/staged-updates. Added Wave-a Track B4 (2026-07-11) — the route already wrote it; the column was missing (P1 #5 phantom-column class).';

COMMIT;
