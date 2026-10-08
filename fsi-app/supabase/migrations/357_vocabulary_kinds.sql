-- subject: Migration 357 (lane G5-READ, 2026-10-07, buildout plan Stage 5): `entity_kind` gains `material` (an adopted material term is a real entity on the spine); the `intelligence_items.theme` CHECK of migration 102 is replaced by a BEFORE trigger that accepts the 7 code themes plus the adopted `theme` terms of vocabulary_terms (migration 355); APPLIED (production ledger version 20261007095953, as of 2026-10-07).
-- 357 -- vocabulary kinds: entity_kind `material`, and the theme CHECK replaced by an adopted-term-aware trigger (lane G5-READ, 2026-10-07).
--
-- APPLIED (production ledger version 20261007095953, as of 2026-10-07). Authored by lane G5-READ; the coordinator applied it (two-track policy, CLAUDE.md standing rule 3:
-- schema DDL applies via the Supabase CLI before the dependent code commits). Requires migration 355
-- (public.vocabulary_terms) and migration 282 (public.entity_kind). The dependent code is
-- src/lib/vocabulary/adopted-entities.mjs (mints kind `material`) and src/lib/agent/{parse-output,metadata-vocab}.ts
-- (accept an adopted theme); an adopted theme written before this applies would be refused by the old CHECK.
--
-- WHY. G5-TERMS counts mentions of things the system does not hold and adopts a term by rule (distinct_items >=
-- the trust.ts recurrence threshold and distinct_sources >= 2). An adopted term that no reader sees is a table
-- write with no effect (standing rule 17), so G5-READ makes every code-held vocabulary a union of the code
-- constant and the adopted terms of the matching kind. Two of those readers land in the schema:
--
-- (a) entity_kind `material`. An adopted `material` term mints an `entities` row through entity-id.mjs
--   (kind `material`, seed = the normalised term key); an adopted `standard` mints kind `instrument`, which
--   already exists. ALTER TYPE ... ADD VALUE cannot be USED in the transaction that adds it, so the self-check
--   proves the value is present in pg_enum; the id_matches_kind CHECK of migration 282
--   (`entity_id LIKE 'cl:' || kind::text || ':%'`) is generic over kind and needs no change.
--
-- (b) theme. Migration 102's CHECK `intelligence_items_theme_check` pinned the column to the 7 code themes, so a
--   theme the system had adopted could never be stored. A CHECK cannot read another table, so the CHECK is
--   dropped and replaced by the BEFORE INSERT OR UPDATE trigger `intelligence_items_theme_guard_trg`, whose
--   function accepts NULL, the 7 code values (the same list metadata-vocab.ts DB_THEME_VALUE_LIST pins, and the
--   vocab-sync audit reads from this function), and any `theme` term with status 'adopted' whose stored token
--   (term_key with whitespace runs turned into underscores, themeToken() in adopted-terms.mjs) equals the value.
--   A refusal keeps the old error shape (check_violation, constraint name intelligence_items_theme_check) so
--   every writer that matched it still does. An UPDATE that leaves the theme unchanged is never refused, so a row
--   already holding a theme whose term was later retired is not locked. SECURITY DEFINER with a pinned
--   search_path: vocabulary_terms is admin read only (RLS, migration 355) and the guard must read it whoever
--   writes the row.
--
-- SELF-CHECK. The enum value is present; the CHECK is gone; the trigger and function exist; and an ADVERSARIAL
-- check (standing rule 15: a guard is proven by attack, not by presence) inside a rolled-back sub-transaction:
-- a theme that is neither code nor adopted is refused; a PROPOSED term's token is refused; a RETIRED term's token
-- is refused; an ADOPTED term's token is accepted; a code value is accepted; NULL is accepted. The attack runs on
-- a TEMP table carrying the same guard function, so no other trigger on intelligence_items can interfere and it
-- runs on an empty table too.
--
-- Reversible: DROP TRIGGER intelligence_items_theme_guard_trg ON public.intelligence_items;
--   DROP FUNCTION public.intelligence_items_theme_guard();
--   ALTER TABLE public.intelligence_items ADD CONSTRAINT intelligence_items_theme_check CHECK (theme IS NULL OR theme IN
--   ('emissions_accounting', 'fuels_saf', 'packaging_circular', 'carbon_markets', 'cold_chain_art',
--   'last_mile_electrification', 'disclosure_regimes')) NOT VALID; (the enum value cannot be dropped).

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.intelligence_items does not exist';
  END IF;
  IF to_regclass('public.vocabulary_terms') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.vocabulary_terms does not exist (apply migration 355 first)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_kind') THEN
    RAISE EXCEPTION 'ABORT: type entity_kind does not exist (apply migration 282 first)';
  END IF;
END $$;

-- (a) entity_kind gains `material`
ALTER TYPE public.entity_kind ADD VALUE IF NOT EXISTS 'material';

-- (b) the theme guard
CREATE OR REPLACE FUNCTION public.intelligence_items_theme_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.theme IS NULL THEN
    RETURN NEW;
  END IF;
  -- An unchanged theme is never refused: a retired term must not lock a row that already holds it.
  IF TG_OP = 'UPDATE' AND NEW.theme IS NOT DISTINCT FROM OLD.theme THEN
    RETURN NEW;
  END IF;
  IF NEW.theme IN (
    'emissions_accounting', 'fuels_saf', 'packaging_circular', 'carbon_markets',
    'cold_chain_art', 'last_mile_electrification', 'disclosure_regimes'
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vocabulary_terms t
     WHERE t.kind = 'theme'
       AND t.status = 'adopted'
       AND regexp_replace(btrim(t.term_key), '\s+', '_', 'g') = NEW.theme
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'intelligence_items.theme "%" is neither one of the 7 code themes nor an adopted theme term', NEW.theme
    USING ERRCODE = 'check_violation', CONSTRAINT = 'intelligence_items_theme_check';
END;
$fn$;

COMMENT ON FUNCTION public.intelligence_items_theme_guard() IS
  'Migration 357 (lane G5-READ): replaces the intelligence_items_theme_check CHECK of migration 102. Accepts NULL, the 7 code themes, and any adopted theme term of vocabulary_terms (migration 355) by its stored token (term_key with whitespace runs as underscores). An unchanged theme is never refused. The 7-value list here is pinned to metadata-vocab.ts DB_THEME_VALUE_LIST by scripts/verify/vocab-sync-audit.mjs.';

REVOKE ALL ON FUNCTION public.intelligence_items_theme_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS intelligence_items_theme_guard_trg ON public.intelligence_items;
CREATE TRIGGER intelligence_items_theme_guard_trg
  BEFORE INSERT OR UPDATE ON public.intelligence_items
  FOR EACH ROW
  WHEN (NEW.theme IS NOT NULL)
  EXECUTE FUNCTION public.intelligence_items_theme_guard();

ALTER TABLE public.intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_theme_check;

-- Self-check
DO $$
DECLARE
  v_enum        boolean;
  v_check       int;
  v_trg         int;
  v_fn          int;
  v_neither     boolean := false;
  v_proposed    boolean := false;
  v_retired     boolean := false;
  v_adopted_ok  boolean := false;
  v_code_ok     boolean := false;
  v_null_ok     boolean := false;
  v_attacked    boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'entity_kind' AND e.enumlabel = 'material'
  ) INTO v_enum;
  IF NOT v_enum THEN RAISE EXCEPTION 'ABORT: entity_kind has no material value'; END IF;

  SELECT count(*) INTO v_check FROM pg_constraint
   WHERE conrelid = 'public.intelligence_items'::regclass AND conname = 'intelligence_items_theme_check';
  IF v_check <> 0 THEN RAISE EXCEPTION 'ABORT: intelligence_items_theme_check still exists'; END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgrelid = 'public.intelligence_items'::regclass AND tgname = 'intelligence_items_theme_guard_trg' AND tgenabled = 'O';
  IF v_trg <> 1 THEN RAISE EXCEPTION 'ABORT: intelligence_items_theme_guard_trg is missing or disabled'; END IF;

  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'intelligence_items_theme_guard' AND p.prosecdef;
  IF v_fn <> 1 THEN RAISE EXCEPTION 'ABORT: intelligence_items_theme_guard is missing or not SECURITY DEFINER'; END IF;

  -- Attack, on a TEMP table that carries the same guard function (so no other trigger on intelligence_items can
  -- interfere, and the attack runs on an empty table too). Everything below is rolled back.
  v_attacked := true;
  BEGIN
    CREATE TEMP TABLE g5_theme_probe (id int PRIMARY KEY, theme text) ON COMMIT DROP;
    CREATE TRIGGER g5_theme_probe_trg BEFORE INSERT OR UPDATE ON g5_theme_probe
      FOR EACH ROW WHEN (NEW.theme IS NOT NULL) EXECUTE FUNCTION public.intelligence_items_theme_guard();
    INSERT INTO g5_theme_probe (id, theme) VALUES (1, NULL);

    INSERT INTO public.vocabulary_terms (kind, term_key, label, status, adopted_at, adoption_rule)
      VALUES ('theme', 'g5 selfcheck adopted', 'g5 selfcheck adopted', 'adopted', now(), 'g5_357_selfcheck');
    INSERT INTO public.vocabulary_terms (kind, term_key, label, status)
      VALUES ('theme', 'g5 selfcheck proposed', 'g5 selfcheck proposed', 'proposed');
    INSERT INTO public.vocabulary_terms (kind, term_key, label, status)
      VALUES ('theme', 'g5 selfcheck retired', 'g5 selfcheck retired', 'retired');

    BEGIN
      UPDATE g5_theme_probe SET theme = 'g5_selfcheck_neither' WHERE id = 1;
    EXCEPTION WHEN check_violation THEN v_neither := true;
    END;
    BEGIN
      UPDATE g5_theme_probe SET theme = 'g5_selfcheck_proposed' WHERE id = 1;
    EXCEPTION WHEN check_violation THEN v_proposed := true;
    END;
    BEGIN
      UPDATE g5_theme_probe SET theme = 'g5_selfcheck_retired' WHERE id = 1;
    EXCEPTION WHEN check_violation THEN v_retired := true;
    END;
    BEGIN
      UPDATE g5_theme_probe SET theme = 'g5_selfcheck_adopted' WHERE id = 1;
      v_adopted_ok := true;
    EXCEPTION WHEN check_violation THEN v_adopted_ok := false;
    END;
    BEGIN
      UPDATE g5_theme_probe SET theme = 'fuels_saf' WHERE id = 1;
      v_code_ok := true;
    EXCEPTION WHEN check_violation THEN v_code_ok := false;
    END;
    BEGIN
      UPDATE g5_theme_probe SET theme = NULL WHERE id = 1;
      v_null_ok := true;
    EXCEPTION WHEN check_violation THEN v_null_ok := false;
    END;

    IF NOT v_neither    THEN RAISE EXCEPTION 'ABORT: a theme that is neither code nor adopted was accepted'; END IF;
    IF NOT v_proposed   THEN RAISE EXCEPTION 'ABORT: a PROPOSED term token was accepted as a theme'; END IF;
    IF NOT v_retired    THEN RAISE EXCEPTION 'ABORT: a RETIRED term token was accepted as a theme'; END IF;
    IF NOT v_adopted_ok THEN RAISE EXCEPTION 'ABORT: an ADOPTED term token was refused as a theme'; END IF;
    IF NOT v_code_ok    THEN RAISE EXCEPTION 'ABORT: a code theme was refused'; END IF;
    IF NOT v_null_ok    THEN RAISE EXCEPTION 'ABORT: a NULL theme was refused'; END IF;
    RAISE EXCEPTION 'g5_357_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'g5_357_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 357 OK: entity_kind material present, intelligence_items_theme_check dropped, theme guard trigger enabled (SECURITY DEFINER), attack held (neither, proposed, retired refused; adopted, code, NULL accepted)';
END $$;

COMMIT;
