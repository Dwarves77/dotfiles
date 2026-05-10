-- ════════════════════════════════════════════════════════════════════
-- Migration 052 — raw_fetches persistence table + storage bucket.
--
-- Wave 1a foundation: every successful agent/run source fetch persists
-- the raw HTML to Supabase Storage and a metadata row to raw_fetches.
-- This is the immutable provenance layer feeding Phase 3 widgets and
-- the Wave 1b dedupe pipeline.
--
-- Storage path convention: raw_fetches/{source_id}/{YYYY-MM-DD}/{content_hash}.html.gz
--   - source_id partitioning bounds per-source listing cost
--   - YYYY-MM-DD partitioning bounds per-day listing cost
--   - content_hash filename gives free dedupe (idempotent uploads)
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS raw_fetches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content_hash    TEXT NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path       TEXT NOT NULL,
  http_status     INT,
  html_bytes      BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_fetches_source_fetched
  ON raw_fetches (source_id, fetched_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_fetches_source_hash_uniq
  ON raw_fetches (source_id, content_hash);

COMMENT ON TABLE raw_fetches IS
  'Immutable per-fetch provenance row. One row per successful Browserless render. file_path points at gzipped HTML in Storage bucket raw_fetches.';

COMMENT ON COLUMN raw_fetches.content_hash IS
  'SHA-256 hex of the raw HTML body. Used for idempotency (UNIQUE with source_id) and Wave 1b dedupe.';

-- Storage bucket. INSERT ON CONFLICT to keep idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('raw_fetches', 'raw_fetches', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: service-role only. No anon/authenticated reads.
ALTER TABLE raw_fetches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_fetches_service_role_all ON raw_fetches;
CREATE POLICY raw_fetches_service_role_all ON raw_fetches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storage object policies: service-role only on the raw_fetches bucket.
DROP POLICY IF EXISTS raw_fetches_storage_service_role_all ON storage.objects;
CREATE POLICY raw_fetches_storage_service_role_all ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'raw_fetches')
  WITH CHECK (bucket_id = 'raw_fetches');
