-- 275 — item_forward_events: replace the dedupe key, which silently dropped 54% of the first real run.
--
-- WHAT WENT WRONG. Migration 274 shipped `UNIQUE (intelligence_item_id, event_date, event_kind,
-- source_span)`. That looked right when the schema was designed against FE-1's 24-item fixture, where
-- source_span was usually a full date phrase ("1 January 2026"). The first full-corpus run
-- (forward-events-run-001, 322 live verified items) showed the real distribution: 382 of 902 extracted
-- events carry a BARE-YEAR span ("2030"), because that is genuinely all the source text contains. Under
-- 274's key, every distinct obligation in one item sharing a year and a kind collapses to a single row:
-- measured, 489 of 902 events (54%) would have been silently discarded by an ON CONFLICT DO NOTHING
-- load, with no error and no log line. Two of the collapsing rows, verbatim, are
--   "scope of this Regulation should have the aim of including, by 2030, all the sectors covered by
--    Directive 2003/87/EC"
-- and
--   "By 2030 | Commission target to include all EU ETS sectors in scope"
-- — the same date and kind, different obligations, different source objects. Losing one of those is a
-- content loss, not a deduplication.
--
-- THE FIX, chosen by measurement rather than intuition. Three candidate keys were counted against the
-- real 902-event run before this migration was written:
--   (item, date, kind, source_span)                                  -> keeps 413, drops 489
--   (item, date, kind, md5(obligation_text))                         -> keeps 799, drops 103
--   (item, date, kind, md5(obligation_text), source object id)       -> keeps 901, drops   1
-- The third is adopted. The single remaining drop is a genuine exact duplicate (same item, date, kind,
-- obligation text AND source object), which is precisely what a dedupe key should collapse.
--
-- WHY AN EXPRESSION INDEX AND NOT A COLUMN. md5(obligation_text) is a pure function of a column already
-- stored; materializing it would add a second home for the same fact and a way for the two to drift.
-- coalesce(source_claim_id, source_section_id) is exactly one non-null value per row, enforced already by
-- 274's item_forward_events_claim_id_matches_source_kind_check.
--
-- IDEMPOTENCY IS PRESERVED. The extractor is pure and deterministic, so a re-run over an unchanged corpus
-- slice reproduces byte-identical obligation_text and the same source object ids, and therefore the same
-- key. Re-running still cannot duplicate rows; it can now only fail to collapse rows that were never the
-- same event.
--
-- SAFE BY TIMING. The table is empty at the time this migration runs (274 shipped schema-only and its own
-- post-check asserts 0 rows; the first load happens after this migration). Dropping and recreating the
-- uniqueness rule on an empty table cannot fail on existing data and rewrites nothing.

BEGIN;

ALTER TABLE public.item_forward_events
  DROP CONSTRAINT IF EXISTS item_forward_events_dedupe_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_forward_events_dedupe
  ON public.item_forward_events (
    intelligence_item_id,
    event_date,
    event_kind,
    md5(obligation_text),
    coalesce(source_claim_id, source_section_id)
  );

COMMENT ON INDEX public.uq_item_forward_events_dedupe IS
  'Dedupe key for forward events, replacing migration 274''s (item, date, kind, source_span) constraint. '
  'A bare-year source_span ("2030") is common and not distinguishing, so the key discriminates on the '
  'obligation text and the source object instead. Measured against the first full run: this keeps 901 of '
  '902 events where the old key kept 413.';

DO $$
DECLARE
  n_uniq_con int;
  n_uniq_idx int;
BEGIN
  SELECT count(*) INTO n_uniq_con FROM pg_constraint
    WHERE conrelid = 'public.item_forward_events'::regclass AND conname = 'item_forward_events_dedupe_key';
  IF n_uniq_con <> 0 THEN
    RAISE EXCEPTION 'ABORT: migration 274''s dedupe constraint still present after drop';
  END IF;

  SELECT count(*) INTO n_uniq_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'item_forward_events'
      AND indexname = 'uq_item_forward_events_dedupe';
  IF n_uniq_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: replacement unique index missing';
  END IF;

  RAISE NOTICE 'migration 275 OK: dedupe key replaced (obligation-hash + source-object discriminated)';
END $$;

COMMIT;
