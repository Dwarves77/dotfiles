-- 261 — Drop the dead notification-v1 trio from migration 007 (DB-4 F5 / operator ruling 2026-08-12).
--
-- WHAT GOES, AND WHY.
--
-- Migration 007_community_layer.sql created THREE tables under one "notification-v1" design:
-- notification_subscriptions (user subscription preferences), notification_events (an event log
-- meant to be dispatched by an Edge Function or worker), and notification_deliveries (per-user
-- delivery tracking, FK'd to notification_events). All three were built to be driven by a writer
-- endpoint, /api/notifications/trigger, that was ALREADY DELETED as dead (zero callers) on
-- 2026-07-11 (Wave-alpha Track E e5) — see fsi-app/.discipline/governance/producer-consumer-orphan.mjs
-- around lines 48-52, which names this "the notification-v1 subsystem ... dead end-to-end (DB-4 F5)"
-- in its own allowlist history, and flags the notification_deliveries allowlist entry as STALE for
-- exactly that reason, explicitly deferring the table drop itself to this migration.
--
-- THE EVIDENCE, restated: all three tables have carried ZERO ROWS since creation — nothing has ever
-- written to them, migration-era or since. No src/ code reads or writes notification_events,
-- notification_deliveries, or notification_subscriptions: no `.from()` call, no RPC, no SQL
-- reference anywhere in the repo outside migration 007 itself. Their only writer endpoint,
-- /api/notifications/trigger, is gone. There is no dispatch path left that could ever populate them.
--
-- WHAT DELIBERATELY STAYS, and why the similar names do NOT mean the same subsystem: this repo has a
-- SEPARATE, WORKING notification system — the `notifications` table plus the live API routes under
-- src/app/api/community/notifications/, written by src/lib/notifications/dispatch.ts. That is the
-- in-app inbox behind the bell icon; it has real rows and real readers today. `notifications` has NO
-- foreign key to any of the three tables dropped here, and this migration does not touch it.
-- notification_subscriptions is easy to mistake for part of that live inbox because of the name, but
-- it is NOT — it was created by 007 alongside notification_events/notification_deliveries, shares
-- their zero-rows-ever/zero-readers profile, and is exactly as orphaned. That is why it is included
-- in this drop rather than kept: same migration of origin, same dead-end-to-end evidence, same
-- disposition. Per the operator ruling of 2026-08-12, the surviving in-app-inbox pair
-- (notifications + its dispatch.ts / api/community/notifications/ readers) is the chosen system of
-- record; the notification-v1 trio is retired rather than wired up, since nothing in the product ever
-- depended on it existing.
--
-- SAFETY. This is a content-gated tombstone in the same shape as migrations 219/254: a PRE-CHECK
-- ABORTS the whole migration if reality has drifted from the audit — i.e. if ANY of the three tables
-- now holds even one row, because a row appearing after a "zero rows, ever" audit means something is
-- writing to a table this migration assumes is provably dead, and dropping it would then destroy real
-- data rather than an empty shell. Drops run FK-safe order (notification_deliveries, which holds the
-- FK to notification_events, first; then notification_events; then the unrelated
-- notification_subscriptions) and use DROP TABLE IF EXISTS WITHOUT CASCADE: if some object this audit
-- missed unexpectedly depends on any of the three, the bare DROP fails loudly with a dependency error
-- instead of silently cascading into and destroying that dependent object. A POST-CHECK confirms all
-- three are gone AND that public.notifications — the table that must survive — still exists.
--
-- REVERSIBILITY. Structure only is recoverable from migration 007's history / this file; there is no
-- data to recover because there was never any data in these tables.

DO $$
DECLARE
  subs_rows bigint;
  events_rows bigint;
  deliveries_rows bigint;
BEGIN
  -- GATE: every one of the three must still be empty. Any row means the "zero rows, ever" audit no
  -- longer holds and this migration's premise is wrong — stop and re-audit rather than drop live data.
  IF to_regclass('public.notification_subscriptions') IS NOT NULL THEN
    SELECT count(*) INTO subs_rows FROM public.notification_subscriptions;
    IF subs_rows > 0 THEN
      RAISE EXCEPTION 'ABORT: notification_subscriptions has % row(s) — no longer empty, re-audit before dropping.', subs_rows;
    END IF;
  END IF;

  IF to_regclass('public.notification_events') IS NOT NULL THEN
    SELECT count(*) INTO events_rows FROM public.notification_events;
    IF events_rows > 0 THEN
      RAISE EXCEPTION 'ABORT: notification_events has % row(s) — no longer empty, re-audit before dropping.', events_rows;
    END IF;
  END IF;

  IF to_regclass('public.notification_deliveries') IS NOT NULL THEN
    SELECT count(*) INTO deliveries_rows FROM public.notification_deliveries;
    IF deliveries_rows > 0 THEN
      RAISE EXCEPTION 'ABORT: notification_deliveries has % row(s) — no longer empty, re-audit before dropping.', deliveries_rows;
    END IF;
  END IF;

  RAISE NOTICE 'PRE-CHECK OK: notification_subscriptions=0, notification_events=0, notification_deliveries=0 rows — safe to drop.';
END $$;

-- FK-safe order: notification_deliveries holds the FK to notification_events, so it must go first.
-- No CASCADE anywhere below — if something outside this trio unexpectedly depends on one of these
-- tables, the bare DROP TABLE IF EXISTS fails loudly with a dependency error rather than silently
-- cascading into and destroying that dependent object.
DROP TABLE IF EXISTS public.notification_deliveries;
DROP TABLE IF EXISTS public.notification_events;
DROP TABLE IF EXISTS public.notification_subscriptions;

-- POST-CHECK: the trio is gone, and the LIVE inbox table is untouched. A migration that drops the
-- wrong thing must fail here, not in production traffic.
DO $$
DECLARE
  survivors int;
BEGIN
  SELECT count(*) INTO survivors
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('notification_subscriptions', 'notification_events', 'notification_deliveries');
  IF survivors <> 0 THEN
    RAISE EXCEPTION 'POST-DROP ABORT: % notification-v1 table(s) survive', survivors;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION 'POST-DROP ABORT: public.notifications was removed — this migration must never touch the live in-app inbox table';
  END IF;

  RAISE NOTICE 'OK: notification-v1 trio (notification_deliveries, notification_events, notification_subscriptions) dropped; public.notifications intact';
END $$;
