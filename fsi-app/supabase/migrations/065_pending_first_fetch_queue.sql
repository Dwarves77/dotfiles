-- ════════════════════════════════════════════════════════════════════
-- Migration 065 — pending_first_fetch queue + enqueue trigger.
--
-- Wave 1b foundation. Closes the registry-to-ingestion handoff gap
-- documented in dotfiles/docs/registry-to-ingestion-handoff-design-2026-05-10.md.
-- When a row in `sources` becomes eligible for ingestion (INSERT, or
-- UPDATE that flips auto_run_enabled false -> true), enqueue a
-- pending_first_fetch row so the new /api/worker/drain-first-fetch
-- worker route picks it up on the next hourly cron tick.
--
-- Pattern P3 from the design doc: Postgres trigger inserts only into
-- the queue (no pg_net), drain worker pulls and forwards to
-- /api/agent/run after seeding a stub intelligence_items row.
--
-- Migration number 065. Number 064 is reserved for a parallel
-- dashboard RPC dispatch that is not part of this PR.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── Queue table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_first_fetch (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  queued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'fetching', 'done', 'error', 'skipped')),
  attempt_count     INT NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  last_error_text   TEXT
);

-- One open queue row per source. Done rows stick around for telemetry.
-- Using a partial unique index on (source_id) WHERE status NOT IN ('done', 'skipped')
-- so a re-enable after a successful first fetch is still possible later
-- (the prior 'done' row stays as history, a new 'queued' row inserts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pff_source_open
  ON pending_first_fetch (source_id)
  WHERE status NOT IN ('done', 'skipped');

-- Drain worker pickup query: status='queued' ordered by queued_at.
CREATE INDEX IF NOT EXISTS idx_pff_status_queued_at
  ON pending_first_fetch (status, queued_at);

COMMENT ON TABLE pending_first_fetch IS
  'Wave 1b first-fetch queue. One row per source eligible for first ingestion. Trigger on sources INSERT/UPDATE OF auto_run_enabled enqueues; /api/worker/drain-first-fetch drains.';

COMMENT ON COLUMN pending_first_fetch.status IS
  'Lifecycle: queued (waiting), fetching (drain worker claimed), done (success), error (last attempt failed, may retry), skipped (terminal skip e.g. provisional source or pre-existing intelligence_items row).';

-- ── RLS: service-role only ────────────────────────────────────────
ALTER TABLE pending_first_fetch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pff_service_role_all ON pending_first_fetch;
CREATE POLICY pff_service_role_all ON pending_first_fetch
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON pending_first_fetch FROM PUBLIC;
REVOKE ALL ON pending_first_fetch FROM authenticated;
REVOKE ALL ON pending_first_fetch FROM anon;

-- ── Trigger function ──────────────────────────────────────────────
-- Inserts a queued row when:
--   1. A new source is INSERTed with auto_run_enabled=TRUE, OR
--   2. An existing source flips auto_run_enabled from FALSE/NULL -> TRUE.
-- AND no intelligence_items row already references this source.
--
-- The pre-existing-item gate avoids enqueuing for sources that already
-- have ingestion history (e.g. re-enabling an old source that was
-- previously processed before being paused). Those should flow through
-- the existing /api/worker/check-sources path on the same hourly cron.
--
-- The status/processing_paused filters mirror the design doc Section
-- "Detection scope" so paused or non-active sources do not enqueue.
CREATE OR REPLACE FUNCTION enqueue_pending_first_fetch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_existing_item BOOLEAN;
BEGIN
  -- Eligibility gate: only active, unpaused, auto-run-enabled sources.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.processing_paused, FALSE) = TRUE THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.auto_run_enabled, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: require a real flip on auto_run_enabled. Re-saves of
  -- unrelated columns must not enqueue.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.auto_run_enabled IS NOT DISTINCT FROM NEW.auto_run_enabled THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Skip if an intelligence_items row already references this source.
  -- Sources that already have ingestion history flow through the
  -- existing periodic check-sources worker, not the first-fetch queue.
  SELECT EXISTS (
    SELECT 1 FROM intelligence_items WHERE source_id = NEW.id LIMIT 1
  ) INTO has_existing_item;

  IF has_existing_item THEN
    RETURN NEW;
  END IF;

  -- Enqueue. The partial unique index on (source_id) WHERE status NOT
  -- IN ('done', 'skipped') keeps duplicates out, so use ON CONFLICT
  -- DO NOTHING to make the trigger safe under concurrent flips.
  INSERT INTO pending_first_fetch (source_id, status)
  VALUES (NEW.id, 'queued')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enqueue_pending_first_fetch() IS
  'Trigger function for sources INSERT/UPDATE OF auto_run_enabled. Inserts pending_first_fetch row when source becomes eligible AND no intelligence_items row already exists. Wave 1b foundation.';

-- ── Trigger ───────────────────────────────────────────────────────
-- Fires AFTER INSERT (every row) and AFTER UPDATE OF auto_run_enabled
-- (only when that column changes; saves on overhead for unrelated
-- column updates).
DROP TRIGGER IF EXISTS trg_sources_enqueue_first_fetch_insert ON sources;
CREATE TRIGGER trg_sources_enqueue_first_fetch_insert
  AFTER INSERT ON sources
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_pending_first_fetch();

DROP TRIGGER IF EXISTS trg_sources_enqueue_first_fetch_update ON sources;
CREATE TRIGGER trg_sources_enqueue_first_fetch_update
  AFTER UPDATE OF auto_run_enabled ON sources
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_pending_first_fetch();
