-- subject: Migration 307 (lane FE-DEDUP, 2026-09-04, coordinator dispatch, root cause `[CONFIRMED]` via Supabase MCP 2026-09-04 23:22 UTC: `public.obligations` had 1,149 rows for only 562 distinct `(intelligence_item_id, event_kind, due_date)`, 359 duplicate `item_forward_events` groups). Root cause: migration 275's dedupe key, `(intelligence_item_id, event_date, event_kind, md5(obligation_text), coalesce(source_claim_id, source_section_id))`, discriminates on the source OBJECT as well as the text, so a claim-backed row and a section-backed row from the SAME extraction run with byte-identical `obligation_text` (necessarily different source object ids, one references `section_claim_provenance`, the other `intelligence_item_sections`) hash to two different keys and both insert cleanly; example cited by the coordinator, item `02470d94-abe6-4645-8f5e-6ae421f29393`, events `a4ad1ce7-…` (section) / `ca126684-…` (claim), both `obligation_text` "…entered into force on 14 April 1967…" (37 chars). This is compounded by (not caused by) a separate extractor bug fixed the same lane in `src/lib/forward-events/extract-forward-events.mjs` (`sameObligationContent`'s `DEDUPE_MIN_COMPARE_LEN` 40-char floor was wrongly applied even to an exact full-string match, see that file's own "SHORT-TEXT EXACT-DUPLICATE FIX" header; `EXTRACTOR_VERSION` `fe1-2026-09-04.5` → `.6`), which is why the extractor's own within-run dedupe never caught these particular 70-of-359 short-text groups at extraction time either. THE FIX: drops the `coalesce(source_claim_id, source_section_id)` term entirely, new index `uq_item_forward_events_text_identity` on `(intelligence_item_id, event_kind, event_date, md5(obligation_text))`, replacing `uq_item_forward_events_dedupe`. A genuinely distinct obligation sharing item/date/kind still coexists freely (Euro 7's 40-event phase-out schedule, NZIA's four distinct 2030-01-01 targets, migration 274/275's own preserved design intent), since its text differs. TWO-TRACK ORDERING (CLAUDE.md rule 3): this is schema DDL, but it can only be applied AFTER the one-time data cleanup removes the live duplicate rows, `CREATE UNIQUE INDEX` cannot build over rows that violate the target uniqueness. The cleanup is `scripts/maintenance/forward-events-retext.mjs --apply` (same lane): its `duplicate_groups` finding, previously report-only, now auto-deletes each group's section-backed `would_drop_id` via a guarded, cited (`DUPLICATE_CITE`), snapshotted, reversible delete (`obligations.forward_event_id` `ON DELETE CASCADE`, migration 290, removes the corresponding `obligations` row automatically, no second writer). Measured over the live corpus by this lane (real, unmodified `dedupeEvents`/`sameObligationContent` run directly against a full snapshot, read-only): with the extractor fix applied, 296 of 1,152 `item_forward_events` rows drop (zero remaining duplicate groups under the new key), so `obligations` moves **1,149 → 853**, not the naive 562 a bare `(item, event_kind, due_date)` group-count floor would suggest, since that floor would also collapse the genuinely-distinct multi-event cases above. Migration file carries a pre-check `DO` block that counts remaining duplicate groups under the new key and `RAISE EXCEPTION`s (naming the exact remediation command) if any remain, so applying out of order fails loudly rather than corrupting anything; a post-check confirms the old index is gone and the new one exists. `apply-extraction-output.mjs`'s own client-side `dedupeKey` (its pre-insert idempotency check) is updated the same lane to mirror this new key. **APPLIED LIVE 2026-09-05 01:25 UTC** by the coordinator via Supabase MCP after Maintenance #47 (`forward-events-retext` apply, run 33935716862) removed the twins: pre-check found 0 duplicate groups, migration 275's index dropped, `uq_item_forward_events_text_identity` in place (item_forward_events 1,152 → 821, obligations 1,149 → 818 by cascade). Was: written, not applied, the lane's Supabase MCP was read-only SELECT. Reversible: `DROP INDEX uq_item_forward_events_text_identity; CREATE UNIQUE INDEX uq_item_forward_events_dedupe ON item_forward_events (intelligence_item_id, event_date, event_kind, md5(obligation_text), coalesce(source_claim_id, source_section_id));` (restores migration 275's index; the deleted duplicate rows themselves are NOT restored by this reversal, see `forward-events-retext.mjs`'s own `--arg restore:<id,...>` for that).
-- 307 — item_forward_events: close the claim/section text-identity loophole in the dedupe key.
--
-- THE DEFECT [CONFIRMED by the coordinator, Supabase MCP 2026-09-04 23:22 UTC]: public.obligations had
-- 1,149 rows but only 562 distinct (intelligence_item_id, event_kind, due_date) -- 359 duplicate groups.
-- Every duplicate pair, measured, is two item_forward_events rows for the SAME item, event_kind,
-- event_date, and byte-identical obligation_text, from the SAME extraction run (identical created_at
-- 2026-09-04 13:09:42.772303+00, extractor_version fe1-2026-09-04.3): one source_kind='claim', one
-- source_kind='section'. Example, cited directly by the coordinator: item 02470d94-abe6-4645-8f5e-
-- 6ae421f29393, events a4ad1ce7-4372-4cff-9922-b2b9ee422aa4 (section) and ca126684-... (claim), both
-- obligation_text "...entered into force on 14 April 1967..." (37 characters).
--
-- WHY THE LIVE INDEX (migration 275) DID NOT CATCH THIS. Its key is
--   (intelligence_item_id, event_date, event_kind, md5(obligation_text), coalesce(source_claim_id, source_section_id))
-- -- coalesce(source_claim_id, source_section_id) is exactly one non-null id per row (274's own CHECK
-- constraint), and a claim-backed row and a section-backed row for the "same" real-world obligation
-- necessarily carry DIFFERENT source object ids (one references section_claim_provenance, the other
-- intelligence_item_sections). Two rows with identical text but different source objects therefore hash to
-- two DIFFERENT keys under 275's index and both insert cleanly -- the twin passes straight through. This is
-- not a regression of 275: that migration's own header measured and deliberately kept the source-object
-- discriminator to avoid collapsing the NZIA/Euro-7 shape (several GENUINELY DISTINCT obligations sharing
-- one item/date/kind, each with its own source object and its own, DIFFERENT text) -- see that migration's
-- header for the counts. This migration does not reopen that risk: obligation_text stays in the key, so two
-- distinct-text rows sharing a source-object-less identity still coexist. It only removes the source-object
-- term, so two rows that ALREADY agree on item/date/kind/text (a real content duplicate, regardless of
-- which of the two source tables backs each) collapse to one.
--
-- THE UPSTREAM FIX, in the same lane, is in extract-forward-events.mjs (EXTRACTOR_VERSION fe1-2026-09-04.6,
-- see that file's own "SHORT-TEXT EXACT-DUPLICATE FIX" header): sameObligationContent's 40-char length
-- floor was applied even to an EXACT full-string match, so a claim/section pair whose obligation_text is
-- identical but under 40 characters (the live example above, 37 chars) was never recognized as a duplicate
-- by the extractor's OWN semantic dedupe (dedupeEvents) either -- this is why the twin was ever produced by
-- an extraction run in the first place, not just why the DB-level index failed to reject it. That fix is
-- forward-looking (future extraction runs); this migration is the DB-level backstop making the shape
-- impossible to insert ever again, from any writer, present or future.
--
-- THIS MIGRATION MUST RUN AFTER THE ONE-TIME CLEANUP, NEVER BEFORE. Per this repo's two-track migration
-- policy (CLAUDE.md rule 3: schema DDL applies before dependent code; a DATA cleanup for existing duplicate
-- rows is a separate, prior step), scripts/maintenance/forward-events-retext.mjs's own duplicateGroups
-- finding (lane FE-DEDUP, 2026-09-04 -- see that file's own header) must be run with --apply FIRST, through
-- the coordinator's normal MAINT dispatch, to delete the section-backed loser of every live twin (obligations
-- rows cascade-delete automatically, migration 290's own ON DELETE CASCADE). Applying this migration BEFORE
-- that cleanup is not silently wrong -- it CANNOT succeed: CREATE UNIQUE INDEX physically cannot build over
-- rows that violate the target uniqueness, and the pre-check DO block below aborts with an explicit count
-- before Postgres would ever attempt (and fail) the index build, so the failure mode is a clear, named abort
-- rather than a cryptic "duplicate key value violates unique constraint" mid-migration.
--
-- WHY DROP AND RECREATE RATHER THAN ALTER. Postgres has no ALTER INDEX to change an expression index's
-- column list; migration 275 itself established this repo's own pattern for the identical situation
-- (DROP CONSTRAINT / CREATE UNIQUE INDEX IF NOT EXISTS in one migration) -- reused verbatim here.
--
-- SAFE BY CONSTRUCTION, NOT BY TIMING (unlike 275, which relied on the table being empty at apply time):
-- this table is NOT empty now, so the safety here is the pre-check DO block, which counts exactly the rows
-- the new key would reject and ABORTS the whole migration (ROLLBACK, since it runs inside the same
-- transaction as the DROP/CREATE) if that count is nonzero, before either DDL statement runs.

BEGIN;

-- Pre-check: abort loudly, with an exact count, rather than let CREATE UNIQUE INDEX fail with Postgres' own
-- generic "duplicate key value violates unique constraint" (which would still leave the old index intact,
-- since the DROP above it runs in the same transaction and the whole thing rolls back on any error --  but
-- naming the actual reason up front is worth the two extra statements).
DO $$
DECLARE
  n_dupe_groups int;
BEGIN
  SELECT count(*) INTO n_dupe_groups FROM (
    SELECT intelligence_item_id, event_kind, event_date, md5(obligation_text)
    FROM public.item_forward_events
    GROUP BY intelligence_item_id, event_kind, event_date, md5(obligation_text)
    HAVING count(*) > 1
  ) dupes;
  IF n_dupe_groups <> 0 THEN
    RAISE EXCEPTION 'ABORT: % duplicate (intelligence_item_id, event_kind, event_date, md5(obligation_text)) '
      'group(s) remain in item_forward_events -- run scripts/maintenance/forward-events-retext.mjs --apply '
      '(lane FE-DEDUP, 2026-09-04) FIRST to delete the section-backed loser of each live twin, THEN re-apply '
      'this migration. This index cannot be created over duplicate rows.', n_dupe_groups;
  END IF;
  RAISE NOTICE 'migration 307 pre-check OK: 0 duplicate groups under the new key -- safe to proceed';
END $$;

ALTER TABLE public.item_forward_events
  DROP CONSTRAINT IF EXISTS item_forward_events_dedupe_key;

DROP INDEX IF EXISTS public.uq_item_forward_events_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_forward_events_text_identity
  ON public.item_forward_events (
    intelligence_item_id,
    event_kind,
    event_date,
    md5(obligation_text)
  );

COMMENT ON INDEX public.uq_item_forward_events_text_identity IS
  'Dedupe key for forward events, replacing migration 275''s (item, date, kind, md5(text), '
  'coalesce(source_claim_id, source_section_id)) index -- the source-object term let a claim-backed row '
  'and a section-backed row with byte-identical obligation_text coexist (359 live duplicate groups, '
  'lane FE-DEDUP, 2026-09-04). Dropping that term makes any future row sharing '
  '(item, event_kind, event_date, obligation_text) with an existing row, regardless of which table backs '
  'it, impossible to insert -- a genuinely distinct obligation sharing the same item/date/kind (Euro 7''s '
  'phase-out schedule, NZIA''s several 2030-01-01 targets) still coexists freely, because its text differs.';

-- Post-check: the replacement index exists and the old one is gone.
DO $$
DECLARE
  n_old_idx int;
  n_new_idx int;
BEGIN
  SELECT count(*) INTO n_old_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'item_forward_events'
      AND indexname = 'uq_item_forward_events_dedupe';
  IF n_old_idx <> 0 THEN
    RAISE EXCEPTION 'ABORT: migration 275''s old index still present after drop';
  END IF;

  SELECT count(*) INTO n_new_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'item_forward_events'
      AND indexname = 'uq_item_forward_events_text_identity';
  IF n_new_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: replacement text-identity unique index missing';
  END IF;

  RAISE NOTICE 'migration 307 OK: claim/section text-identity dedupe key in place';
END $$;

COMMIT;
