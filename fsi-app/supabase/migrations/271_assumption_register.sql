-- 271 — assumption_register: WO-20, the register for modelling constants THIS PRODUCT chose
-- (docs/plans/wo20-assumption-register-spec.md), as distinct from emission_factors (WO-12/18 — numbers
-- the WORLD published). Confirmed greenfield, spec §0: no assum*/parameter*/constant*/config*/weight*/
-- threshold*/register*/tuning*/default* table exists in the live public schema (84-table sweep, this
-- session's re-verification of master execution plan v2 Appendix A's "confirmed ABSENT" claim).
--
-- WHAT THIS CREATES. One row per modelling constant catalogued in spec §2 (10 catalogued today,
-- spanning src/lib/connections/discover.mjs, src/lib/connections/pair-view.mjs,
-- src/app/api/admin/{canonical-sources,sources}/recommend-classification/route.ts,
-- scripts/lib/urgency.mjs, src/lib/contracts/factor-tier.mjs) — a connection-scorer weight, an idf
-- coefficient, a score floor, a bias-tag confidence cutoff, an urgency score mapping, a pedigree floor —
-- none of which has a DB row today, most of which have nothing more than an inline code comment as their
-- only record of why the value is what it is (spec §1).
--
-- Natural key: assumption_key text UNIQUE NOT NULL, dot-namespaced <subsystem>.<mechanism>.<parameter>
-- (e.g. connections-scorer.weight.shared_source, urgency.priority_and_tier.score_mapping). NOT a
-- surrogate UUID as the LOOKUP key (id still exists, for FK targets like superseded_by) — the register's
-- job is to be joinable against source by a string a reader can construct from first principles, exactly
-- the role uq_intelligence_items_canonical_key_verified_live's key plays for instrument identity
-- (migration 200). subsystem is free text in v1 (spec §7 Q2 — too small a population, 4 values today, to
-- justify a managed vocabulary alongside origin_class/derivation).
--
-- THE ENVELOPE, NARROWED. Every column from value_numeric through as_at_date below is emitted by
-- src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL("assumption_register", { columns: [
-- 'value_numeric','unit','derivation','origin_class','source_key','source_ref','n_observations',
-- 'method_version','as_at_date'] }) — the SAME renderer, importing the SAME origin_class (7-value) and
-- derivation (9-value) vocabularies migration 258/267/268 already use. currency and reference_period are
-- DELIBERATELY EXCLUDED (spec §3): none of the 10 catalogued rows are monetary rates or period
-- aggregates. The origin_class and derivation CHECKs below are therefore BYTE-IDENTICAL to 258's/267's/
-- 268's, asserted by an anti-drift test (src/__tests__/contracts-assumption-register-migration.test.mjs),
-- never hand-copied.
--
-- WHAT THIS DELIBERATELY DOES NOT DO (spec §6, anti-scope):
--   NO seed rows (schema-only, this migration). NO change to discover.mjs, pair-view.mjs, urgency.mjs,
--   factor-tier.mjs or the two recommend-classification routes — every constant stays exactly where it
--   is, in code, as the live value the product runs on; this table is a parallel RECORD, never a runtime
--   read path (spec §4 — discover.mjs's own header states "PURE, no DB, no LLM" and this migration does
--   not touch that). NO resolution of row 8's ADR-007/code drift (spec §2 row 8, §7 Q1) — registered
--   as-is, current code value, governing_decision NULL, the disagreement flagged not silently reconciled.
--   NO drift-check script (spec §4's named-but-unbuilt scripts/verify/assumption-register-drift.mjs).
--   NO widening of the origin_class/derivation vocabularies — all 10 rows fit the live 7/9-value sets.
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'assumption_register';                                          -- 20 rows
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.assumption_register'::regclass AND contype = 'u';          -- 1 row
--   SELECT count(*) FROM public.assumption_register;                                      -- 0 (schema only)
--   INSERT ... origin_class = 'not-a-real-value' ON public.assumption_register            -- must FAIL
--     (23514 check_violation) on assumption_register_origin_class_check.
--   INSERT ... status = 'not-a-real-status' ON public.assumption_register                 -- must FAIL
--     (23514 check_violation) on assumption_register_status_check.
--
-- DDL IS GENERATED. scripts/gen/migration-271-assumption-register.mjs splices the GENERATED block below
-- from src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL(); do not hand-edit inside the markers.
--
-- Two-track policy (CLAUDE.md standing rule 3): schema DDL applies via the sanctioned lane BEFORE the
-- dependent code merges (spec §4's admin panel reader, spec §5's later, separately-ratified 10-row
-- backfill). This migration is schema-only — additive, no data write, no dependency on either — so it is
-- safe to apply as soon as it is reviewed. APPLIED BY THE COORDINATOR ONLY (spec §5 step 5); this file is
-- written by an executor lane and left unapplied.

-- ── assumption_register: identity + registry columns (spec §3, hand-written, not part of the envelope) ─
CREATE TABLE IF NOT EXISTS public.assumption_register (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_key      text NOT NULL UNIQUE,
  subsystem           text NOT NULL,
  label               text NOT NULL,
  rationale           text NOT NULL,
  code_location       text NOT NULL,
  governing_decision  text,
  status              text NOT NULL DEFAULT 'active',
  superseded_by       uuid REFERENCES public.assumption_register(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assumption_register_status_check CHECK (status IN ('active','superseded','retired'))
);

COMMENT ON TABLE public.assumption_register IS
  'WO-20: the register for modelling constants this product chose (a scorer weight, a confidence cutoff, '
  'a pedigree floor) — distinct from emission_factors, the register for numbers the world published. '
  'Read-only display consumer only (spec src/app/admin AdminDashboard "Assumptions" panel, not yet built '
  'by this migration); never a runtime read path for the code that embodies each constant.';

COMMENT ON COLUMN public.assumption_register.assumption_key IS
  'Dot-namespaced natural key, <subsystem>.<mechanism>.<parameter> (e.g. '
  'connections-scorer.weight.shared_source). The lookup identity a reader constructs from first '
  'principles, not a surrogate id — see this table''s own COMMENT.';

COMMENT ON COLUMN public.assumption_register.subsystem IS
  'First assumption_key segment, denormalized for filtering/grouping (spec §2''s "File" grouping). Free '
  'text in v1 (spec §7 Q2) — too small a population (4 values today) to justify a managed vocabulary.';

COMMENT ON COLUMN public.assumption_register.label IS
  'Short human label, e.g. "Shared-source signal weight" — what a reader sees in the admin panel.';

COMMENT ON COLUMN public.assumption_register.rationale IS
  'Why this value — the durable, queryable form of today''s inline code comment (spec §1). May also carry '
  'sub-parameters packed into one row''s value_numeric where the source constant is a small lookup table '
  '(e.g. a multi-tier pedigree floor or a multi-branch confidence cutoff) rather than a single scalar.';

COMMENT ON COLUMN public.assumption_register.code_location IS
  'file:line where the literal is DEFINED today (spec §2 col 2) — the drift-detectable pointer a future '
  'scripts/verify/assumption-register-drift.mjs (named, not built, spec §4) would re-read and compare '
  'against value_numeric. Verified against the live file this row was authored, not copied from a plan.';

COMMENT ON COLUMN public.assumption_register.governing_decision IS
  'ADR id or session-log ruling citation (e.g. "ADR-019"), or NULL where no ratified decision governs '
  'this value today — NULL is an honest answer, never a placeholder for "not checked" (spec §7 Q1).';

COMMENT ON COLUMN public.assumption_register.status IS
  'active | superseded | retired. A retuned constant gets a NEW row with superseded_by set on the old '
  'one (append-only supersession, the same posture emission_factors already models) — never an in-place '
  'edit, per CLAUDE.md standing rule 1.';

COMMENT ON COLUMN public.assumption_register.superseded_by IS
  'Self-referential FK to the row that replaced this one, when status = ''superseded''. NULL otherwise.';

-- ── the envelope (WO-12 shape, narrowed — no currency, no reference_period; generated) ─────────────────
-- >>> GENERATED: assumption_register_envelope >>>
ALTER TABLE public.assumption_register
  ADD COLUMN IF NOT EXISTS value_numeric numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS derivation text,
  ADD COLUMN IF NOT EXISTS origin_class text,
  ADD COLUMN IF NOT EXISTS source_key text REFERENCES public.data_sources(source_key),
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS n_observations integer,
  ADD COLUMN IF NOT EXISTS method_version text,
  ADD COLUMN IF NOT EXISTS as_at_date date;

ALTER TABLE public.assumption_register ADD CONSTRAINT assumption_register_derivation_check CHECK (derivation IN ('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated', 'interpolated', 'modelled', 'estimated'));

ALTER TABLE public.assumption_register ADD CONSTRAINT assumption_register_origin_class_check CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

ALTER TABLE public.assumption_register ADD CONSTRAINT assumption_register_n_observations_positive_check CHECK (n_observations IS NULL OR n_observations > 0);

COMMENT ON COLUMN public.assumption_register.value_numeric IS 'The number itself, decomposed out of a legacy free-text display column. NULL means this row has not been re-keyed through the envelope yet; a legacy text column (where one exists on the table) remains the display source until it is.';

COMMENT ON COLUMN public.assumption_register.unit IS 'Unit of value_numeric (e.g. "EUR/tonne", "index_points", "USD/hour"). Required to interpret value_numeric; a populated value_numeric with a NULL unit is a malformed envelope, not a valid one — enforced at the write path (this migration does not add a DB-level co-nullability CHECK, so a later hardening pass may).';

COMMENT ON COLUMN public.assumption_register.derivation IS 'How value_numeric was produced (IOSCO PD391 2.3(a)): statutory_fixed | statutory_formula | observed | transacted_index | assessed | calculated | interpolated | modelled | estimated. Same 9-value vocabulary as emission_factors.derivation (migration 258), owned by src/lib/contracts/envelope.mjs DERIVATION — this column never defines a second one.';

COMMENT ON COLUMN public.assumption_register.origin_class IS 'Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class (migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being forced into the weakest class it might not deserve.';

COMMENT ON COLUMN public.assumption_register.source_key IS 'The licence-cleared external dataset this value came from, joined through the SAME licence register emission_factors.source_key already uses (public.data_sources / licence_clear_sources). Deliberately not the `sources` table other columns on this row may already reference — that FK is the trust-tier register for editorial content, a different question from which redistributable dataset supplied a number.';

COMMENT ON COLUMN public.assumption_register.source_ref IS 'The table, row, page or series id within the source, so a reader can check the figure without re-deriving it.';

COMMENT ON COLUMN public.assumption_register.n_observations IS 'Sample size behind an aggregated figure, where the derivation is an aggregate. Governs significant-figure rounding at render (see envelope.mjs significantFigures()).';

COMMENT ON COLUMN public.assumption_register.method_version IS 'Version tag of the method that produced value_numeric, when derivation is calculated/modelled/estimated. Lets a later method change be told apart from a data change in the same series.';

COMMENT ON COLUMN public.assumption_register.as_at_date IS 'When the source asserted this value (not when we ingested it, not when the underlying event occurred — envelope.mjs''s as-of triple keeps those three questions separate).';
-- <<< END GENERATED: assumption_register_envelope <<<

-- ── lookups ──────────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS assumption_register_subsystem_idx
  ON public.assumption_register (subsystem, assumption_key);

-- ── RLS and grants ───────────────────────────────────────────────────────────────────────────────────
-- Same posture as migration 258/268's reference tables: read-only to authenticated, no INSERT/UPDATE/
-- DELETE policy (writes arrive through the service role via the guarded path, scripts/lib/db.mjs).
ALTER TABLE public.assumption_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assumption_register_read ON public.assumption_register;
CREATE POLICY assumption_register_read ON public.assumption_register FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.assumption_register TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols   int;
  n_unique int;
  n_rows   int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assumption_register';
  SELECT count(*) INTO n_unique FROM pg_constraint
    WHERE conrelid = 'public.assumption_register'::regclass AND contype = 'u';
  SELECT count(*) INTO n_rows FROM public.assumption_register;

  IF n_cols <> 20 THEN
    RAISE EXCEPTION 'ABORT: assumption_register has % columns, expected 20 (11 identity/registry + 9 narrowed envelope)', n_cols;
  END IF;
  IF n_unique <> 1 THEN
    RAISE EXCEPTION 'ABORT: assumption_register does not carry exactly one UNIQUE constraint (found %)', n_unique;
  END IF;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: assumption_register is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 271 OK: assumption_register created, 20 columns, UNIQUE(assumption_key), 0 rows (schema only)';
END $$;
