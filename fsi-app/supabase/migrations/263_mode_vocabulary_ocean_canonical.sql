-- 263 — the canonical transport-mode token is `ocean`, and the duplicate mode CHECK is removed
-- (operator ruling 2026-08-12).
--
-- TWO DEFECTS IN MIGRATION 258, BOTH FIXED HERE.
--
-- DEFECT 1: THE WRONG CANONICAL TOKEN. 258 shipped `sea` as the stored mode value. That was chosen on
-- the reasoning that ISO 14083, the GLEC Framework and Regulation (EU) 2026/1030 all enumerate
-- "maritime", so the internal token should follow the standards. The operator overruled it, correctly:
-- that confuses an OUTPUT concern with an INTERNAL one. This is a freight forwarding product. Its users,
-- its rate boards, its bookings and its lane names say OCEAN FREIGHT. The stored token follows the
-- domain; mapping `ocean` to whatever wording a given regulatory report demands is a rendering step at
-- the edge of that report and belongs there, not smeared through the identity layer.
--
-- `sea` and `maritime` are retained as INPUT ALIASES in normaliseMode() (src/lib/contracts/
-- vocabularies.mjs) and are never stored. They arrive constantly from regulatory text and third-party
-- feeds, so they must RESOLVE rather than be rejected.
--
-- DEFECT 2: TWO CHECK CONSTRAINTS ON ONE COLUMN. 258 carried BOTH a hand-written inline
-- `CHECK (mode IN (...))` on the column (auto-named emission_factors_mode_check) AND the codegen'd
-- named constraint emission_factors_mode, because the inline copy was left behind when the vocabulary
-- moved into the generated block. They happened to agree, so nothing failed, which is precisely why it
-- would have survived: a duplicated definition is invisible until the two copies disagree, and then the
-- column silently accepts only their INTERSECTION. Had this shipped alongside the token change, `mode`
-- would have accepted road, rail, air and inland_waterway and NOTHING ELSE, rejecting both `sea` and
-- `ocean` while both constraints looked individually correct.
--
-- The inline copy is dropped, not re-pointed. One definition, generated from LEG_MODE_CODES.
--
-- SAFE BY TIMING: emission_factors holds ZERO rows (258 created structure only; the DESNZ/EPA numbers
-- are a separate unit). No value needs rewriting and no data can be invalidated. The pre-check asserts
-- that rather than trusting it.

-- ── Pre-check: refuse to run if reality has drifted from the audit ───────────────────────────────────
DO $$
DECLARE n_rows bigint;
BEGIN
  IF to_regclass('public.emission_factors') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.emission_factors does not exist — migration 258 must be applied first';
  END IF;

  SELECT count(*) INTO n_rows FROM public.emission_factors;
  IF n_rows > 0 THEN
    -- Deliberate stop. With rows present, changing the mode vocabulary is a DATA migration
    -- (every 'sea' row must become 'ocean') and needs an UPDATE plus its own verification, not a
    -- constraint swap. Rewriting stored values silently under a constraint change is how a corpus
    -- gets a token nobody chose.
    RAISE EXCEPTION
      'ABORT: emission_factors holds % row(s). This migration assumes an empty table. '
      'Add an explicit UPDATE ... SET mode = ''ocean'' WHERE mode = ''sea'' and re-verify before proceeding.',
      n_rows;
  END IF;
END $$;

-- ── Defect 2: drop the duplicate inline constraint ───────────────────────────────────────────────────
-- IF EXISTS because a database created from the REGENERATED 258 never had this constraint at all; only
-- the one live database that applied 258 before the fix carries it. The migration must be correct for
-- both starting states.
ALTER TABLE public.emission_factors DROP CONSTRAINT IF EXISTS emission_factors_mode_check;

-- ── Defect 1: the codegen'd constraint, re-stated with the canonical token ───────────────────────────
-- Kept in sync with LEG_MODE_CODES in src/lib/contracts/vocabularies.mjs. `multimodal` is deliberately
-- absent: it is a corridor-level value, and a factor is per leg, so a multimodal factor is a category
-- error rather than a missing row.
ALTER TABLE public.emission_factors DROP CONSTRAINT IF EXISTS emission_factors_mode;
ALTER TABLE public.emission_factors
  ADD CONSTRAINT emission_factors_mode
  CHECK (mode IN ('road', 'rail', 'ocean', 'inland_waterway', 'air'));

-- ── Post-check ───────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_mode_constraints int;
  def               text;
BEGIN
  SELECT count(*) INTO n_mode_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.emission_factors'::regclass
    AND contype = 'c'
    -- WORD-BOUNDARY match, not ILIKE '%mode%'. The first draft of this check used ILIKE and aborted
    -- with "found 3", because 'modelled' (a derivation value AND an origin_class value) contains the
    -- substring "mode". The whole migration rolled back on a false alarm from its own post-check.
    AND pg_get_constraintdef(oid) ~ '\mmode\M';

  IF n_mode_constraints <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 mode CHECK constraint, found %', n_mode_constraints;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conrelid = 'public.emission_factors'::regclass AND conname = 'emission_factors_mode';

  IF def IS NULL OR def NOT ILIKE '%ocean%' THEN
    RAISE EXCEPTION 'ABORT: emission_factors_mode does not carry the canonical token: %', coalesce(def, '(missing)');
  END IF;
  IF def ILIKE '%''sea''%' THEN
    RAISE EXCEPTION 'ABORT: emission_factors_mode still carries the superseded token ''sea'': %', def;
  END IF;

  RAISE NOTICE 'migration 263 OK: one mode CHECK, canonical token is ocean';
END $$;
