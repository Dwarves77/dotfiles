-- 318: delete the item_forward_events rows the D10 defect fabricated.
--
-- Defect D10, docs/plans/defect-fix-plan-2026-09-12.md. The section-side forward-events extractor
-- (src/lib/forward-events/extract-forward-events.mjs) accepted an "In force as of <date>." sentence
-- whose date was the RUN date -- the 6.1b pilot bodies' own writing date, not a date the instrument
-- states -- because a deontic clause happened to sit within the CANDIDATE_ONLY_RULES 200-char
-- look-ahead. Coordinator live SQL, 2026-09-12: 2 rows in item_forward_events matched exactly this
-- shape (source_kind = 'section', obligation_text = 'In force as of <date>.', source_span equal to
-- the bare date, event_date equal to the run date), created 2026-09-11 and 2026-09-12, in 2 distinct
-- items -- one confirmed as item 252f0ecf; the plan's own count is 2 (docs/plans/defect-fix-plan-
-- 2026-09-12.md D10). This lane (L6) has no live DB credentials to independently re-confirm the
-- second item id by a read-only SELECT of the same predicate -- 2 expected per the plan; the
-- coordinator asserts the exact count (and identifies both item ids) before applying this file.
--
-- Lane L6 fixed the root cause in the same commit series as this file (extract-forward-events.mjs's
-- reference-date and status-only refusals, plus read-and-extract.mjs supplying referenceDates and the
-- verbatim-in-a-FACT-claim class fix) -- this migration is the one-time CLEANUP of the rows the
-- now-fixed extractor already wrote before the fix landed. Fabricated rows are DELETED, never kept as
-- records: CLAUDE.md standing rule 2 ("never fabricate") and rule 13 ("a flag is a commitment") both
-- rule out leaving a known-fabricated row in place with a comment instead of removing it.
--
-- Per CLAUDE.md standing rule 3 (migration two-track policy): this is a DATA migration, committed
-- alongside the fix's consumer code, and run AFTER merge by the coordinator -- NOT applied by this
-- lane. No schema change; the predicate is exact and self-limiting (see below), so this file is safe
-- to run once, live, whenever the coordinator applies it.
--
-- THE PREDICATE, exactly the D10 shape and nothing wider: source_kind = 'section' (a claim-kind event
-- is already verbatim by construction and was never in scope of this defect); obligation_text LIKE
-- 'In force as of %' (the exact fabricated sentence prefix, never a bare "as of" or "since" match that
-- could catch a genuine status-adjacent obligation); source_span = event_date::text (the matched date
-- substring stored as source_span must equal the row's own event_date rendered as text -- true only
-- for this exact shape, since a real dated obligation's obligation_text is the surrounding sentence,
-- not merely the date, and its source_span need not equal event_date::text in every representation but
-- does for this specific fabricated shape). A row that only partially matches (e.g. a real "In force as
-- of <date>, pending Article 12 review" sentence with additional clause text) is NOT touched by this
-- predicate.
--
-- REVERSIBLE: no. A DELETE of fabricated rows has no honest inverse -- restoring them would mean
-- reintroducing the fabrication. If the predicate is later found to have matched a genuine row (not
-- observed; the plan's own live count is 2, both confirmed fabricated), recovery is re-extraction via
-- read-and-extract.mjs against the item's current claims/sections, never a manual re-INSERT.

BEGIN;

DO $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.item_forward_events
   WHERE source_kind = 'section'
     AND obligation_text LIKE 'In force as of %'
     AND source_span = event_date::text;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Informational only -- never aborts the migration. The plan's own expected count is 2; a
  -- mismatch here is the coordinator's signal to re-check the live predicate before treating this
  -- apply as routine, not a reason for this file to fail closed on a count it cannot independently
  -- re-verify from this lane.
  RAISE NOTICE 'D10 cleanup (migration 318): deleted % row(s) matching the fabricated "In force as of <date>." shape (plan-expected: 2)', v_deleted;
END $$;

COMMIT;
