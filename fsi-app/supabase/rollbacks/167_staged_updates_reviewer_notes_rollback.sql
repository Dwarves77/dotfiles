-- Rollback for migration 167 — drop staged_updates.reviewer_notes.
-- NOTE: reversing this re-introduces the P1 #5 phantom-column 500 if the route still writes reviewer_notes.
-- Only reverse in tandem with a code revert that stops writing the column.

BEGIN;

ALTER TABLE public.staged_updates
  DROP COLUMN IF EXISTS reviewer_notes;

COMMIT;
