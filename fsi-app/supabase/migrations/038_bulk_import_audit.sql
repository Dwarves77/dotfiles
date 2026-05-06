-- 038_bulk_import_audit.sql
-- W2.A — bulk-import audit trail.
--
-- One row per non-dryRun /api/admin/sources/bulk-import call. Captures
-- who imported what, the raw payload (truncated at 100K chars at the
-- API layer to keep this table small), the per-row preview summary,
-- and the apply outcome counters. RLS is read-only for authenticated
-- users so admins can audit historical imports from the UI; writes
-- come through the service-role client in the route handler.

CREATE TABLE IF NOT EXISTS bulk_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json')),
  total_rows INT NOT NULL,
  sources_inserted INT NOT NULL DEFAULT 0,
  provisional_inserted INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  raw_input TEXT NOT NULL,
  preview_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_imports_imported_by
  ON bulk_imports(imported_by);

CREATE INDEX IF NOT EXISTS idx_bulk_imports_created
  ON bulk_imports(created_at DESC);

COMMENT ON TABLE bulk_imports IS
  'W2.A: Audit log for /api/admin/sources/bulk-import. One row per applied (non-dryRun) call. preview_summary captures the per-row outcome the route returned to the caller.';

ALTER TABLE bulk_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_imports_read_authenticated"
  ON bulk_imports FOR SELECT
  USING (auth.role() = 'authenticated');
