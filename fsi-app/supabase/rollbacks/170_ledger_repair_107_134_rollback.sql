-- Rollback for migration 170 — remove the 15 ledger rows this migration inserted.
-- Safe: deletes ONLY the exact 15 versions, and only their ledger entries (no schema object is touched —
-- the migrations remain applied; this just reverts the ledger fact). Use only to reverse 170.

BEGIN;

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '107','108','109','110','111','112','115','118',
  '128','129','130','131','132','133','134'
)
AND statements IS NULL;  -- guard: only the ledger-repair rows (statements NULL), never a real-apply row

COMMIT;
