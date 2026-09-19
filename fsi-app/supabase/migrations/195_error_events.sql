-- subject: Migration 195 (Wave-β R0.2 first-party error tracking — the "Sentry or equivalent" with NO external service). New table `error_events` (one row per error GROUP keyed by (stack_hash, release, side, route); columns occurred_at/last_seen_at/release/env/side CHECK server|client/route/message/stack_hash/stack_excerpt/user_scope (org id nullable — NO raw PII)/count). Dedup: UNIQUE index on (stack_hash, release, side, route) — the ingest lib (`src/lib/telemetry/capture-error.ts`) INSERTs then increments `count` on 23505. Plus a named (stack_hash, release) index + a last_seen_at DESC listing index. `stack_hash` is computed SERVER-SIDE ONLY (`src/lib/telemetry/stack-hash.mjs`, unit-tested) so clients cannot forge group collisions. RLS: enabled, NO write policies (service-role-only write path) + ONE platform-admin SELECT policy (profiles.is_platform_admin, mig 075 pattern) backing the /admin Runtime → Errors panel. message/stack_excerpt/route length-bounded by CHECK (defense in depth). Reversible (`supabase/rollbacks/195_error_events_rollback.sql`, DROP TABLE). APPLIED 2026-07-11 (wave-alpha). [glyph:verbatim]
-- Migration 195: error_events — first-party error tracking substrate (Wave-β R0.2).
--
-- WHY FIRST-PARTY: there is no Sentry account and the operator has ruled zero
-- external service signups. "Error tracking (Sentry or equivalent)" is therefore
-- satisfied by this table + the captureError() lib (src/lib/telemetry/) + the
-- /api/telemetry/error ingest route + the /admin Runtime → Errors read surface.
--
-- Shape: one row per ERROR GROUP, keyed by (stack_hash, release, side, route).
-- Repeat occurrences INCREMENT count (the increment runs in the ingest lib —
-- read-modify-write via service role; DDL stays simple per the dispatch brief)
-- and bump last_seen_at. stack_hash is computed SERVER-SIDE ONLY
-- (src/lib/telemetry/stack-hash.mjs) from the normalized message + top frames,
-- so clients cannot forge collisions into unrelated groups beyond their own rows.
--
-- PII posture: user_scope carries an ORG id (nullable), never a user id, email,
-- or IP. message/stack_excerpt are length-bounded by CHECK as defense in depth
-- (the ingest lib also clamps before write).
--
-- RLS: enabled, NO INSERT/UPDATE/DELETE policies → writes are service-role only
-- (service role bypasses RLS; the ingest lib is the single write path). One
-- SELECT policy for platform admins (profiles.is_platform_admin, migration 075
-- pattern) so the /admin Runtime → Errors panel can read with the session client.
--
-- Reversible: see supabase/rollbacks/195_error_events_rollback.sql (DROP TABLE).
-- NOT YET APPLIED.

CREATE TABLE IF NOT EXISTS error_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- first occurrence in this group
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- most recent occurrence
  release        TEXT        NOT NULL DEFAULT 'dev',  -- git sha (VERCEL_GIT_COMMIT_SHA, fallback 'dev')
  env            TEXT        NOT NULL DEFAULT 'unknown',
  side           TEXT        NOT NULL CHECK (side IN ('server', 'client')),
  route          TEXT        NOT NULL DEFAULT '' CHECK (char_length(route) <= 300),
  message        TEXT        NOT NULL CHECK (char_length(message) <= 1000),
  stack_hash     TEXT        NOT NULL CHECK (char_length(stack_hash) <= 64),
  stack_excerpt  TEXT        NULL     CHECK (char_length(stack_excerpt) <= 4000),
  user_scope     UUID        NULL,                    -- org id only; NO raw PII by design
  count          INT         NOT NULL DEFAULT 1
);

-- Dedup identity for the ingest increment (also covers the (stack_hash, release)
-- lookup as its leading prefix).
CREATE UNIQUE INDEX IF NOT EXISTS idx_error_events_dedup
  ON error_events (stack_hash, release, side, route);

-- Explicit (stack_hash, release) index per the dispatch brief. The unique index
-- above already prefixes it; kept as the named contract index.
CREATE INDEX IF NOT EXISTS idx_error_events_hash_release
  ON error_events (stack_hash, release);

-- Admin listing order.
CREATE INDEX IF NOT EXISTS idx_error_events_last_seen
  ON error_events (last_seen_at DESC);

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

-- Platform-admin read (migration 075/099 pattern). No write policies: writes
-- go through the service-role ingest path only.
CREATE POLICY error_events_admin_read ON error_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );
