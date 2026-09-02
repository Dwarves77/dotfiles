-- 289 — criterion 2 URL extraction: balanced parentheses (coordinator, 2026-09-02, population run #12).
--
-- DEFECT. `validate_item_provenance` extracts citation URLs from section prose with
--   https?://[^\s)\]\}"'<>]+
-- which stops at the first ')'. EUR-Lex "(01)" corrigendum/second-publication identifiers
-- (CELEX 32023D0628(01), 32023D0207(01)) therefore extract as `...32023D0628(01`, which no grounded URL
-- (item.source_url, agent_run_searches.result_url, sources.url) canonicalizes to, and the item fails
-- criterion 2 `ungrounded_url`. Population run #12 (mint-run-014) lost 2 of 42 payloads this way; the
-- local validator (scripts/mint/validate-mint-payload.mjs URL_RE) mirrors the same regex, so both layers
-- rejected them before any write. Any prose URL carrying a parenthesised path segment hits the same wall.
--
-- FIX. One-level balanced parentheses, the standard fix for URL extraction:
--   https?://(?:[^\s()\]}"'<>]|\([^\s()]*\))+
-- A '(' is consumed only together with its matching ')'; a URL written inside prose parentheses
-- "(see https://x.org/a)" still extracts as https://x.org/a because the trailing ')' has no '(' inside
-- the URL. Verified live before writing this file: the new pattern returns
-- `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023D0628(01)` for the failing case and
-- `https://x.org/a` for the prose-parenthesis case. `canonicalize_citation_url` already preserves
-- parentheses (checked: canon of the full URL keeps "(01)").
--
-- SHAPE. The function body is 14,164 characters and lives ONLY in the database (migrations 145 → 158 →
-- 171 → 202 → later patches each re-created it; no repo file carries the current dump). Re-pasting the
-- whole body to change one literal would create a second copy that drifts. This migration therefore
-- patches the live definition IN PLACE, guarded three ways: (1) the pre-patch md5 of
-- pg_get_functiondef must equal the value read on 2026-09-02 (7cb3d38f6ea00eec9bb887e6fde25bb9) so it
-- never runs against a body it was not written for; (2) exactly ONE occurrence of the old literal;
-- (3) post-patch, the new literal present and the old absent. Parity: scripts/mint/validate-mint-payload.mjs
-- URL_RE changed in the same commit, with a test on both cases.
--
-- Reversible: run the same block with old/new swapped (the pre-md5 guard then pins the post-patch md5,
-- recorded in docs/inventories/migrations.md when applied).

DO $$
DECLARE
  v_def      text;
  v_old      constant text := $re$'https?://[^\s)\]\}"''<>]+'$re$;
  v_new      constant text := $re$'https?://(?:[^\s()\]\}"''<>]|\([^\s()]*\))+'$re$;
  v_pre_md5  constant text := '7cb3d38f6ea00eec9bb887e6fde25bb9';
  v_count    int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 289: public.validate_item_provenance not found';
  END IF;
  IF md5(v_def) <> v_pre_md5 THEN
    IF position(v_new IN v_def) > 0 AND position(v_old IN v_def) = 0 THEN
      RAISE NOTICE 'migration 289 already applied (new literal present, old absent); no-op';
      RETURN;
    END IF;
    RAISE EXCEPTION 'ABORT 289: live validate_item_provenance md5 % differs from the body this patch was written for (%); read the live definition and re-derive before applying', md5(v_def), v_pre_md5;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ABORT 289: expected exactly 1 occurrence of the old URL literal, found %', v_count;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF position(v_new IN v_def) = 0 OR position(v_old IN v_def) > 0 THEN
    RAISE EXCEPTION 'ABORT 289: post-patch definition does not carry the new literal alone';
  END IF;
  RAISE NOTICE 'migration 289 OK: criterion-2 URL extraction now balances parentheses; post md5 %', md5(v_def);
END $$;
