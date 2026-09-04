-- 300 -- criterion 2 URL extraction: exclude typographic delimiters (lane URL-GUIL, 2026-09-03,
-- population runs #15/#16, mint-run-017/018).
--
-- DEFECT. `validate_item_provenance` (criterion 2, citation-URL grounding) scans section prose for
--   https?://(?:[^\s()\]}"''<>]|\([^\s()]*\))+                                    -- (migration 289)
-- The mint kit delimits every verbatim FACT span with guillemets: record-facts.mjs's templates read
-- "...verbatim: «${span}»", never straight quotes (that choice, and why, is documented at that
-- file's own "SPAN DELIMITERS ARE GUILLEMETS" header). When a span ends with a URL and no whitespace sits
-- between the URL and its closing », the URL_RE above -- which excludes `"` `'` `<` `>` from the class but
-- not « » ‹ › or the curly quotes “ ” ‘ ’ -- consumes the delimiter AS PART of the URL. Measured
-- (population run #16, mint-run-018, `census-rows.mint-batch-report.json` results[0] id
-- `429c85d2-4176-4ff5-ab3e-9d98e364a58a`, UK "The Renewable Transport Fuel Obligations (Amendment) Order
-- 2013", legislation.gov.uk/uksi/2013/816): the extracted URL was `http://eur-lex»`, which grounds
-- against nothing (`item.source_url`, `agent_run_searches.result_url`, `sources.url` are all real URLs
-- with no `»` in them), so the item failed criterion 2 with `ungrounded_url`. A companion defect in the
-- kit's own span-locating triggers (src/lib/intake/record-facts.mjs, fixed in the same lane, NOT a DB
-- change) explains why the span was truncated to `http://eur-lex` in the first place -- see that file's
-- "CONTINUATION IS URL-SAFE" comment and docs/ops/session-log.md Addendum 85 for the full write-up; this
-- migration is the grounding-side half of the fix and stands on its own regardless (any URL glued to a
-- closing typographic delimiter hits the same wall, truncated span or not).
--
-- FIX. Exclude the eight typographic delimiter characters from the URL character class, the same
-- technique the live function already uses for the straight `"` `'` `<` `>`:
--   https?://(?:[^\s()\]}"''<>«»‹›“”‘’]|\([^\s()]*\))+
-- A URL immediately followed by one of these characters now simply stops one character earlier -- the
-- delimiter is never captured, so nothing needs to be trimmed off afterward. Verified live before writing
-- this file (read-only `execute_sql`, no migration applied): `regexp_matches('see http://eur-lex.europa.eu» more',
-- 'the new regex')`-shaped probe against both the old and new literal confirmed the old class swallows
-- the » and the new class does not, for all eight characters individually. Parity:
-- scripts/mint/validate-mint-payload.mjs URL_RE changed in the same commit, with unit tests covering the
-- guillemet case and the fixture shaped like the failing row.
--
-- canonicalize_citation_url (migration 150) is UNCHANGED. Its own trailing-punctuation strip
-- (`'[/.,;:]+$'`) never sees a typographic delimiter under the fix above -- the extraction regex now
-- refuses to capture one in the first place, so there is nothing left for canonicalize_citation_url to
-- trim. Read live (read-only) and confirmed unchanged from its migration-150 definition before writing
-- this file; adding a redundant trim there would only be defensive padding around a case the extraction
-- side no longer produces, so it is left alone per this repo's "patch what the evidence names" discipline.
--
-- SHAPE. Same in-place-patch discipline as migration 289 (see that file's own SHAPE note for why the
-- 14K-character body is patched in place rather than re-pasted): the pre-patch md5 of
-- `pg_get_functiondef` must equal the value read live on 2026-09-03 (82f7032e21424d127d0864e7626b810d, matching migration
-- 289's own post-patch md5 -- confirmed live, read-only, before writing this file: exactly one occurrence
-- of the migration-289 literal, at the same position 289 left it), so this migration never runs against a
-- body it was not written for; exactly ONE occurrence of the old literal; post-patch, the new literal
-- present and the old absent.
--
-- Reversible: run the same block with old/new swapped (the pre-md5 guard then pins the post-patch md5,
-- recorded in docs/inventories/migrations.md when applied).

DO $$
DECLARE
  v_def      text;
  v_old      constant text := $re$'https?://(?:[^\s()\]\}"''<>]|\([^\s()]*\))+'$re$;
  v_new      constant text := $re$'https?://(?:[^\s()\]\}"''<>«»‹›“”‘’]|\([^\s()]*\))+'$re$;
  v_pre_md5  constant text := '82f7032e21424d127d0864e7626b810d';
  v_count    int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 300: public.validate_item_provenance not found';
  END IF;
  IF md5(v_def) <> v_pre_md5 THEN
    IF position(v_new IN v_def) > 0 AND position(v_old IN v_def) = 0 THEN
      RAISE NOTICE 'migration 300 already applied (new literal present, old absent); no-op';
      RETURN;
    END IF;
    RAISE EXCEPTION 'ABORT 300: live validate_item_provenance md5 % differs from the body this patch was written for (%); read the live definition and re-derive before applying', md5(v_def), v_pre_md5;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ABORT 300: expected exactly 1 occurrence of the old URL literal, found %', v_count;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF position(v_new IN v_def) = 0 OR position(v_old IN v_def) > 0 THEN
    RAISE EXCEPTION 'ABORT 300: post-patch definition does not carry the new literal alone';
  END IF;
  RAISE NOTICE 'migration 300 OK: criterion-2 URL extraction now excludes typographic delimiters; post md5 %', md5(v_def);
END $$;
