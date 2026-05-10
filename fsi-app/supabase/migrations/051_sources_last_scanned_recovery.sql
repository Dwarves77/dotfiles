-- 051_sources_last_scanned_recovery.sql
--
-- Wave 1a step 1: retroactive capture of `sources.last_scanned`.
--
-- Background: `last_scanned` was referenced as the per-source scan-cooldown
-- timestamp at src/app/api/agent/run/route.ts (lines 39, 62-63, 374) but
-- never defined in any prior migration. The select at line 37 destructured
-- only `data` (dropping `error`), so the missing-column error from PostgREST
-- was swallowed silently. As a result, four behaviors gated by `sourceRecord`
-- have been disabled on every /api/agent/run invocation:
--   1. Provisional source gate (cost protection)
--   2. Per-source pause check (pauseReason called with id=undefined)
--   3. 1h scan cooldown
--   4. last_scanned timestamp UPDATE
--
-- Caught by gate 3 precheck during Path B Wave 1a setup. Telemetry didn't
-- exist yet (Wave 1a fixes that gap), so production never alerted.
--
-- Idempotent ADD COLUMN — safe to re-run if already applied out-of-band.

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS last_scanned TIMESTAMPTZ NULL;

COMMENT ON COLUMN sources.last_scanned IS
  'Timestamp of last /api/agent/run invocation against this source. Drives the 1h scan cooldown at agent/run/route.ts:62. Distinct from sources.last_checked which is populated by /api/worker/check-sources HEAD prober. Backfilled from last_checked when the column was first added (migration 051) so existing sources are not all eligible at once on first cron tick.';
