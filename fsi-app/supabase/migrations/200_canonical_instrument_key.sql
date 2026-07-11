-- Migration 200 (Wave-α Track C8 / RD-5 in-unit) — canonical instrument key + normalizing trigger +
-- twin-defect uniqueness guard on intelligence_items.
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (adds a column + two functions + a trigger + a partial unique index;
-- schema-only, NO data write here). Authored by the Wave-α C8 sub-agent; APPLIED BY THE ORCHESTRATOR in
-- the gated main session via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P2 provenance/moat; DB-2 SPECIAL DELIVERABLE (b), F3):
--   The same EU instrument exists as two `intelligence_items` rows whose `instrument_identifier` values
--   cannot match string-wise — bare `2025/40` vs `eli/reg/2025/40/oj` vs `CELEX:32022L2464` (25/653
--   populated across 4 incompatible formats). This defeats the "dedup before grounding — entity identity,
--   not title" gate: it has no canonical key to JOIN on. DB-2 found 6 cross-format same-instrument twin
--   pairs, one (PPWR 2025/40) with BOTH rows verified — two live customer-visible copies of one regulation.
--
-- WHAT THIS ADDS:
--   1. Column `intelligence_items.canonical_instrument_key text` (nullable) — the normalized key.
--   2. `derive_canonical_instrument_key(instr, src_url)` — a PURE (IMMUTABLE) deriver that returns the bare
--      CELEX number (e.g. `32019R1242`) when it is CONFIDENTLY derivable from either the instrument_identifier
--      (full CELEX token, or an ELI `eli/{reg|dir|dec}/YYYY/N/oj` path) or the source_url (CELEX token incl.
--      URL-encoded `CELEX%3A`, or an ELI path); NULL otherwise. It NEVER guesses the R/L/D act-type letter
--      from a bare `YYYY/N` (regulation-vs-directive is ambiguous there — 2022/2464 is a DIRECTIVE typed
--      `regulation`), so a bare number with no CELEX/ELI evidence stays NULL. Conservative by design.
--   3. Trigger `trg_set_canonical_instrument_key` (BEFORE INSERT OR UPDATE) — sets the key from the deriver
--      WHEN derivable; otherwise LEAVES any pre-existing value untouched (a non-derivable manual key — e.g. a
--      national gazette id — is preserved, never clobbered to NULL).
--   4. Partial UNIQUE index `uq_intelligence_items_canonical_key_verified_live` — two VERIFIED, non-archived
--      items may NOT share a canonical key. This is the twin-defect guard: it structurally forbids a repeat
--      of PPWR-both-verified. Scoped to verified+live so archived tombstones (5cc10a6d PPWR, 6b0939a5 AFIR are
--      verified BUT archived) do not collide with their live keepers.
--
-- SAFE TO CREATE THE INDEX NOW (proven read-only 2026-07-11, kwrsbpiseruzbfwjpvsp): the same derivation run
--   inline over the live corpus finds ZERO verified+non-archived canonical-key collisions. The column is
--   all-NULL at apply time (backfill is a separate guarded script), so the index is created over an empty
--   predicate set and cannot fail on apply.
--
-- SHIPS WITH (RD-5, "status is a cache" — a gate/uniqueness migration ships its data step):
--   * scripts/_wave-alpha/backfill-canonical-keys.mjs  — populates the column for existing derivable rows
--     (21 derivable; 16 live-unarchived), guarded + snapshotted + read-back. Orchestrator runs it post-apply.
--   * scripts/verify/canonical-key-uniqueness.mjs      — the live-data lane audit (invariant EP-11) that
--     fails if any two verified+live items ever share a key.
--
-- POST-APPLY PROOF:
--   * SELECT derive_canonical_instrument_key('CELEX:32022L2464', NULL)            -> '32022L2464'
--   * SELECT derive_canonical_instrument_key('eli/reg/2025/40/oj', NULL)          -> '32025R0040'
--   * SELECT derive_canonical_instrument_key('2019/1242',
--            'https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32019R1242')-> '32019R1242'
--   * SELECT derive_canonical_instrument_key('2025/40', 'https://example.org/x')  -> NULL  (bare, ambiguous)
--   * After backfill: canonical-key-uniqueness.mjs -> PASS (0 verified-live collisions).
-- Reversible: supabase/rollbacks/200_canonical_instrument_key_rollback.sql (drops index, trigger, both
--   functions, and the column).

BEGIN;

-- 1 — the column
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS canonical_instrument_key text;

COMMENT ON COLUMN public.intelligence_items.canonical_instrument_key IS
  'Normalized instrument identity (bare CELEX number, e.g. 32019R1242) derived from instrument_identifier '
  'or source_url by derive_canonical_instrument_key(); NULL when not confidently derivable. The join key for '
  'dedup-before-grounding; two verified+live items may not share one (uq_..._canonical_key_verified_live).';

-- 2 — the pure deriver
CREATE OR REPLACE FUNCTION public.derive_canonical_instrument_key(p_instr text, p_src_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $fn$
DECLARE
  m     text[];
  v_map text;
BEGIN
  -- (1) a full CELEX token already inside instrument_identifier ('CELEX:32022L2464' or bare '32022L2464')
  m := regexp_match(COALESCE(p_instr, ''), '([1-9][0-9]{4}[A-Z][0-9]{4})');
  IF m IS NOT NULL THEN RETURN upper(m[1]); END IF;

  -- (2) an ELI relative path in instrument_identifier: eli/{reg|dir|dec}/YYYY/N/oj
  m := regexp_match(COALESCE(p_instr, ''), '^eli/(reg|dir|dec)/([0-9]{4})/([0-9]+)');
  IF m IS NOT NULL THEN
    v_map := CASE m[1] WHEN 'reg' THEN 'R' WHEN 'dir' THEN 'L' WHEN 'dec' THEN 'D' END;
    RETURN '3' || m[2] || v_map || lpad(m[3], 4, '0');
  END IF;

  -- (3) a CELEX token embedded in the source_url (handles 'CELEX:' and URL-encoded 'CELEX%3A')
  m := regexp_match(COALESCE(p_src_url, ''), 'CELEX(?::|%3[Aa])?([1-9][0-9]{4}[A-Z][0-9]{4})');
  IF m IS NOT NULL THEN RETURN upper(m[1]); END IF;

  -- (4) an ELI path in the source_url
  m := regexp_match(COALESCE(p_src_url, ''), '/eli/(reg|dir|dec)/([0-9]{4})/([0-9]+)');
  IF m IS NOT NULL THEN
    v_map := CASE m[1] WHEN 'reg' THEN 'R' WHEN 'dir' THEN 'L' WHEN 'dec' THEN 'D' END;
    RETURN '3' || m[2] || v_map || lpad(m[3], 4, '0');
  END IF;

  -- not confidently derivable (bare 'YYYY/N' with no CELEX/ELI evidence, or a non-EU/non-legal item)
  RETURN NULL;
END;
$fn$;

-- 3 — the normalizing trigger (derivation wins when confident; preserves a non-derivable manual value)
CREATE OR REPLACE FUNCTION public.set_canonical_instrument_key()
 RETURNS trigger
 LANGUAGE plpgsql
AS $fn$
DECLARE
  v_key text;
BEGIN
  v_key := public.derive_canonical_instrument_key(NEW.instrument_identifier, NEW.source_url);
  IF v_key IS NOT NULL THEN
    NEW.canonical_instrument_key := v_key;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_canonical_instrument_key ON public.intelligence_items;
CREATE TRIGGER trg_set_canonical_instrument_key
  BEFORE INSERT OR UPDATE ON public.intelligence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_canonical_instrument_key();

-- 4 — the twin-defect guard: no two VERIFIED, non-archived items share a canonical key
CREATE UNIQUE INDEX IF NOT EXISTS uq_intelligence_items_canonical_key_verified_live
  ON public.intelligence_items (canonical_instrument_key)
  WHERE canonical_instrument_key IS NOT NULL
    AND provenance_status = 'verified'
    AND is_archived IS NOT TRUE;

COMMIT;
