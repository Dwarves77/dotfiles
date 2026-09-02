-- 286 — statutory/estimate isolation, Layer 1 (physical tables) + Layer 3 (DB constraint on the input
-- graph) (Lane DP-ENGINE, system-completion train, 2026-09-02 — docs/specs/08-flywheel-design.md §4;
-- docs/decisions/ADR-024-decision-propagation.md).
--
-- WHAT THIS IS. Spec §4's four-layer isolation design, two of the four layers built here (Layer 1 tables,
-- Layer 3 trigger). Layer 2 (a TypeScript type barrier — `StatutoryInput` accepts only `Contractable`
-- derivations, `computeStatutory<F>` cannot type-check against a `modelled`/`estimated` input) lives in
-- `src/lib/propagation/types.ts` (same commit). Layer 4 (separate render components, one gate) is
-- DP-SURF's build (`StatutoryFigure.tsx`/`EstimatedFigure.tsx`).
--
-- LAYER 1, BYTE-FAITHFUL TO SPEC §4's OWN `CREATE TABLE` BLOCKS. Every column and every named CHECK below
-- is transcribed from the spec text with nothing added — same "transcribe, don't improve on" posture
-- migration 282's header states for spec §1.1's `entities` block.
--
-- LAYER 3 — assert_statutory_purity() — DELIBERATE, DOCUMENTED DEVIATION FROM SPEC §4'S OWN ILLUSTRATIVE
-- TRIGGER BODY. Spec's version walks `derivation_edges` transitively FROM `NEW.entity_id`, because in
-- spec's own schema `derivation_edges` keys BOTH `derived_id` and `input_id` to `entities(entity_id)` and
-- a statutory computation IS an entity in that scheme. This lane's `derivation_edges` (migration 285)
-- instead addresses an edge's consuming end as `to_value_id uuid REFERENCES derived_values(value_id)` —
-- `statutory_computations` rows are NEVER a `to_value_id` (spec §4's own design keeps a statutory result
-- TERMINAL: nothing downstream ever depends on it AS an input, by construction — a filing figure is an
-- endpoint, not an ingredient), so there is no DAG edge to walk FROM a `statutory_computations` row in the
-- first place. The natural, and per this lane's own governing plan's LITERAL instruction, enforcement
-- point is therefore the row's OWN DECLARED `inputs` jsonb column (the `InputRef[]` shape `types.ts`
-- defines and `statutory_computations.inputs`/`derived_values.inputs` both carry) — checked DIRECTLY,
-- rather than walked transitively through a graph that does not reach this table. This is a SHALLOWER
-- check than spec's own transitive walk, and that is intentional and safe here specifically: Layer 2's
-- type barrier (`computeStatutory`) only ever accepts `StatutoryInput`s whose `derivation` is
-- `Contractable`, so the ONLY way a bad input reaches this table at all is a caller that bypasses Layer 2
-- entirely (a raw INSERT) — Layer 3 exists PRECISELY for that bypass case, and a bypass caller's `inputs`
-- column is exactly what this trigger inspects. A NAMED RESIDUAL (not fixed here): if a future lane adds
-- MULTI-HOP statutory composition (a statutory computation that cites another statutory computation's
-- RESULT as one of its own inputs, transitively reaching a modelled value two hops back), this shallow
-- check would not catch it — the fix, if that shape is ever built, is to ALSO register `statutory_
-- computations` as a legal `derivation_edges.to_value_id`-shaped target (a schema widening) and add the
-- transitive walk spec §4 illustrates. Named here so the next lane does not have to re-discover it.
--
-- 2026-09-02 AMENDMENT (Lane DP-SURF, coordinator-directed, ADR-024 dated amendment recorded in
-- docs/decisions/ADR-024-decision-propagation.md) — `entity_id` DEMOTED FROM PRIMARY KEY ON BOTH TABLES,
-- STILL BELOW. Unapplied at the time of this edit, so amended in place rather than layered in a follow-on
-- migration (no live rows depend on the old shape). WHY: spec §4's own DDL, taken byte-faithful above, made
-- `entity_id` the primary key of both tables — AT MOST ONE statutory_computations row and AT MOST ONE
-- estimated_values row per entity, ever. Running the seed (scripts/propagation/seed-derived-values.mjs)
-- against this shape produces ZERO usable rows for any entity with more than one (formula_id,
-- formula_version) or (model_id, model_version) pair — e.g. a jurisdiction entity that is the subject of
-- BOTH a FuelEU statutory computation and an automate-vs-hire estimate collides on the same PK, and a
-- single entity scoped to more than one seed scenario collides with itself. `entity_id` is corrected here
-- to what it always semantically was — the SUBJECT (a required FK, not a uniqueness key) — and each table
-- gets its own surrogate PK (`computation_id`/`estimate_id`, uuid, `gen_random_uuid()` default, matching
-- this codebase's other surrogate-PK tables e.g. `derived_values.value_id` in migration 285). A new
-- `scenario_key text NOT NULL DEFAULT 'default'` column and a `UNIQUE (entity_id, formula_id,
-- formula_version, scenario_key)` / `UNIQUE (entity_id, model_id, model_version, scenario_key)` constraint
-- replace the old PK's uniqueness guarantee at the granularity that actually matters (one row per entity
-- per formula/model version per named scenario — 'default' for the common case, a caller-chosen key for a
-- named what-if scenario), rather than removing uniqueness altogether. Every CHECK constraint from the
-- byte-faithful block above is UNCHANGED. assert_statutory_purity() is unchanged in its logic (it never
-- read entity_id as a uniqueness key, only as the row identifier in its RAISE EXCEPTION message, updated
-- below to name the row by its new PK). The outbox trigger's PK-column argument
-- (`emit_propagation_event(...)`, migration 284) is updated from `'entity_id'` to `'computation_id'` /
-- `'estimate_id'` respectively, since that argument names the triggering table's ACTUAL primary key column
-- and entity_id no longer is one.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
  IF to_regclass('public.derived_values') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.derived_values does not exist — migration 285 must be applied first';
  END IF;
END $$;

-- ── statutory_computations (spec §4 Layer 1, verbatim CHECKs; PK/uniqueness shape amended 2026-09-02 — ──
-- ── see the migration header's dated amendment note) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.statutory_computations (
  computation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        text NOT NULL REFERENCES public.entities(entity_id),
  scenario_key     text NOT NULL DEFAULT 'default',
  obligation_id    text NOT NULL REFERENCES public.entities(entity_id),
  formula_id       text NOT NULL,
  formula_version  text NOT NULL,
  statute_citation text NOT NULL,
  unit_price       numeric,
  unit_price_unit  text,
  inputs           jsonb NOT NULL,
  result           numeric NOT NULL,
  result_unit      text NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT statutory_needs_citation CHECK (length(statute_citation) > 0),
  CONSTRAINT statutory_never_null_result CHECK (result IS NOT NULL),
  CONSTRAINT statutory_computations_entity_formula_scenario_uniq
    UNIQUE (entity_id, formula_id, formula_version, scenario_key)
);

COMMENT ON TABLE public.statutory_computations IS
  'Spec 08 §4 Layer 1, byte-faithful in every CHECK: a published formula, published constants, an auditable '
  'input set. ISOLATED from estimated_values by four independent layers — physical table (this one), a '
  'TypeScript type barrier (types.ts StatutoryInput/computeStatutory), this table''s own INSERT/UPDATE '
  'trigger (assert_statutory_purity, below — a single mistake at any ONE layer is caught by another), and '
  'separate render components (DP-SURF''s StatutoryFigure, never sharing a visual slot with EstimatedFigure). '
  'PK is computation_id (surrogate uuid), NOT entity_id — see the migration header''s 2026-09-02 amendment: '
  'entity_id is the subject (required FK, many rows per entity), uniqueness is entity_id + formula_id + '
  'formula_version + scenario_key.';
COMMENT ON COLUMN public.statutory_computations.entity_id IS
  'The SUBJECT of this computation (a required FK into entities) — NOT a uniqueness key on its own since '
  '2026-09-02 (one entity can be the subject of many computations: different formulas, different formula '
  'versions, or different named scenarios). See statutory_computations_entity_formula_scenario_uniq.';
COMMENT ON COLUMN public.statutory_computations.scenario_key IS
  '''default'' for the ordinary single-computation-per-(entity,formula,version) case; a caller-chosen key '
  'to seed more than one named what-if scenario for the same entity/formula/version without colliding on '
  'the unique constraint. Added 2026-09-02 alongside computation_id (see migration header).';
COMMENT ON COLUMN public.statutory_computations.inputs IS
  'jsonb array of InputRef {"table","pk","version"} (types.ts) — the SAME shape derived_values.inputs '
  'uses (migration 285). assert_statutory_purity() (below) inspects this array directly: any element '
  'naming an estimated_values row, or a derived_values row whose derivation is modelled/estimated/'
  'interpolated, raises.';
COMMENT ON COLUMN public.statutory_computations.unit_price IS
  'e.g. 2400.00 (spec §4''s own FuelEU Maritime example, EUR 2,400/t VLSFOe). Nullable: not every statutory '
  'formula carries a single scalar unit price (formula_id/formula_version disambiguate the shape).';

CREATE INDEX IF NOT EXISTS statutory_computations_entity_idx ON public.statutory_computations (entity_id);

-- ── estimated_values (spec §4 Layer 1, verbatim CHECKs; PK/uniqueness shape amended 2026-09-02 — see ────
-- ── the migration header's dated amendment note) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimated_values (
  estimate_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     text NOT NULL REFERENCES public.entities(entity_id),
  scenario_key  text NOT NULL DEFAULT 'default',
  model_id      text NOT NULL,
  model_version text NOT NULL,
  point         numeric,
  low           numeric,
  high          numeric,
  distribution  jsonb,
  pedigree      jsonb NOT NULL,
  CONSTRAINT estimate_has_uncertainty CHECK (low IS NOT NULL OR distribution IS NOT NULL),
  CONSTRAINT estimate_range_ordered   CHECK (low IS NULL OR high IS NULL OR low <= high),
  CONSTRAINT estimate_brackets_point
    CHECK (point IS NULL OR low IS NULL OR (point BETWEEN low AND high)),
  CONSTRAINT estimated_values_entity_model_scenario_uniq
    UNIQUE (entity_id, model_id, model_version, scenario_key)
);

COMMENT ON TABLE public.estimated_values IS
  'Spec 08 §4 Layer 1, byte-faithful in every CHECK: model output, scenario bands, projections. '
  'Range-native — a point estimate is the EXCEPTION, not the default (estimate_has_uncertainty forbids a '
  'point with no low/distribution). ADR-024 decision 2: NEVER backs a customer-visible decision, only a '
  'customer-visible RANGE (ESTIMATE_DISPLAY="range", src/lib/entities/decisions.mjs) — DP-SURF''s '
  'EstimatedFigure always renders low/high, never a point-only mode. PK is estimate_id (surrogate uuid), '
  'NOT entity_id — see the migration header''s 2026-09-02 amendment: entity_id is the subject (required '
  'FK, many rows per entity), uniqueness is entity_id + model_id + model_version + scenario_key.';
COMMENT ON COLUMN public.estimated_values.entity_id IS
  'The SUBJECT of this estimate (a required FK into entities) — NOT a uniqueness key on its own since '
  '2026-09-02 (one entity can be the subject of many estimates: different models, different model '
  'versions, or different named scenarios). See estimated_values_entity_model_scenario_uniq.';
COMMENT ON COLUMN public.estimated_values.scenario_key IS
  '''default'' for the ordinary single-estimate-per-(entity,model,version) case; a caller-chosen key to '
  'seed more than one named what-if scenario for the same entity/model/version without colliding on the '
  'unique constraint. Added 2026-09-02 alongside estimate_id (see migration header).';
COMMENT ON COLUMN public.estimated_values.pedigree IS
  'ecoinvent 5-axis pedigree score (reliability/completeness/temporal/geographical/technological '
  'correlation, 1..5 each) — validatePedigree() in src/lib/contracts/vocabularies.mjs is the shared '
  'validator; NOT re-validated at the DB layer here (jsonb shape, no per-key CHECK), matching this '
  'schema''s "DB shape, application validates content" posture for other jsonb columns (e.g. '
  'derived_values.inputs).';

CREATE INDEX IF NOT EXISTS estimated_values_entity_idx ON public.estimated_values (entity_id);

-- ── assert_statutory_purity() — Layer 3 (see header for the deliberate deviation from spec's own body) ──
CREATE OR REPLACE FUNCTION public.assert_statutory_purity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bad_estimate boolean;
  bad_derived  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.inputs) AS ref
    WHERE (ref->>'table') = 'estimated_values'
      -- An estimated_values input may be addressed by estimate_id (the surrogate PK since the ADR-024
      -- amendment) or by entity_id (the pre-amendment shape). Both are refused. Found at live apply
      -- (coordinator, 2026-09-02): the amendment moved the PK but this predicate still matched entity_id only.
      AND EXISTS (
        SELECT 1 FROM public.estimated_values ev
        WHERE ev.entity_id = (ref->>'pk') OR ev.estimate_id::text = (ref->>'pk')
      )
  ) INTO bad_estimate;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.inputs) AS ref
    JOIN public.derived_values dv ON dv.value_id::text = (ref->>'pk')
    WHERE (ref->>'table') = 'derived_values'
      AND dv.derivation IN ('modelled', 'estimated', 'interpolated')
  ) INTO bad_derived;

  IF bad_estimate OR bad_derived THEN
    RAISE EXCEPTION
      'statutory computation % (entity %) depends on a non-contractable input (an estimated_values row, '
      'or a derived_values row whose derivation is modelled/estimated/interpolated) — spec 08 §4 Layer 3',
      NEW.computation_id, NEW.entity_id;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.assert_statutory_purity() IS
  'Spec 08 §4 Layer 3, adapted (see this migration''s header for the deliberate deviation from spec''s own '
  'transitive-DAG-walk body): inspects NEW.inputs DIRECTLY rather than walking derivation_edges, because a '
  'statutory_computations row is never a to_value_id (it is a terminal figure, never an input to anything '
  'else) so there is no DAG edge to walk FROM this table. Refuses any element naming a live estimated_values '
  'row, or a derived_values row whose derivation is in (modelled, estimated, interpolated).';

DROP TRIGGER IF EXISTS statutory_purity_trg ON public.statutory_computations;
CREATE TRIGGER statutory_purity_trg
  BEFORE INSERT OR UPDATE ON public.statutory_computations
  FOR EACH ROW EXECUTE FUNCTION public.assert_statutory_purity();

-- ── Attach the outbox trigger (function defined in migration 284) ──────────────────────────────────────
-- 2026-09-02: the PK-column argument names the triggering table's ACTUAL primary key column
-- (emit_propagation_event()'s own contract, migration 284) — 'entity_id' → 'computation_id'/'estimate_id'
-- now that entity_id is no longer the PK of either table (see migration header amendment).
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.statutory_computations;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.statutory_computations
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('computation_id');

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.estimated_values;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.estimated_values
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('estimate_id');

-- ── Indexes ──────────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS statutory_computations_obligation_idx ON public.statutory_computations (obligation_id);
CREATE INDEX IF NOT EXISTS statutory_computations_formula_idx ON public.statutory_computations (formula_id, formula_version);
CREATE INDEX IF NOT EXISTS estimated_values_model_idx ON public.estimated_values (model_id, model_version);

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────────
-- Unlike derived_values (migration 285), these two tables carry NO admissibility gate to hide — a
-- statutory_computations row is, by construction, always the strongest class (spec §4: "a published
-- formula, published constants, an auditable input set"); an estimated_values row is always range-native
-- and DP-SURF's EstimatedFigure enforces the display rule (ADR-024 decision 2) at the component layer, not
-- by hiding rows. Both are customer-figure-backing tables the same way emission_factors is (migration
-- 258's posture: read-only to authenticated, no write policy — writes are service-role only).
ALTER TABLE public.statutory_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimated_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_computations_read ON public.statutory_computations;
CREATE POLICY statutory_computations_read ON public.statutory_computations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS estimated_values_read ON public.estimated_values;
CREATE POLICY estimated_values_read ON public.estimated_values FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.statutory_computations, public.estimated_values TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_sc_cols int;
  n_ev_cols int;
  n_trg int;
  ok_entity text := 'cl:jurisdiction:0000000000000001';
  ok_entity2 text := 'cl:jurisdiction:0000000000000002';
  ok_obligation text := 'cl:obligation:0000000000000003';
  rejected boolean;
BEGIN
  -- 13/10, not 11/8: 2026-09-02 amendment adds computation_id/estimate_id (surrogate PK) and
  -- scenario_key to each table (see migration header) — 11+2=13, 8+2=10.
  SELECT count(*) INTO n_sc_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'statutory_computations';
  IF n_sc_cols <> 13 THEN
    RAISE EXCEPTION 'ABORT: statutory_computations has % columns, expected 13', n_sc_cols;
  END IF;

  SELECT count(*) INTO n_ev_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimated_values';
  IF n_ev_cols <> 10 THEN
    RAISE EXCEPTION 'ABORT: estimated_values has % columns, expected 10', n_ev_cols;
  END IF;

  SELECT count(*) INTO n_trg FROM pg_trigger
    WHERE tgname IN ('statutory_purity_trg', 'propagation_outbox_trg') AND NOT tgisinternal
      AND tgrelid IN ('public.statutory_computations'::regclass, 'public.estimated_values'::regclass);
  IF n_trg <> 3 THEN -- purity + outbox on statutory_computations, outbox on estimated_values
    RAISE EXCEPTION 'ABORT: expected 3 triggers across statutory_computations/estimated_values, found %', n_trg;
  END IF;

  -- Layer 3 falsification test (spec §7 assertion 4, "a statutory computation whose input graph touches
  -- an estimate fails to insert"): build a real entities + estimated_values fixture and prove the insert
  -- is rejected, using real rows (not merely a comment claiming it works).
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_entity, 'jurisdiction', 'selftest jurisdiction') ON CONFLICT DO NOTHING;
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_entity2, 'jurisdiction', 'selftest jurisdiction 2') ON CONFLICT DO NOTHING;
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_obligation, 'obligation', 'selftest obligation') ON CONFLICT DO NOTHING;
  INSERT INTO public.estimated_values (entity_id, model_id, model_version, low, high, pedigree)
    VALUES (ok_entity2, 'selftest-model', '1', 1, 2, '{"reliability":3,"completeness":3,"temporal_correlation":3,"geographical_correlation":3,"technological_correlation":3}'::jsonb)
    ON CONFLICT DO NOTHING;

  BEGIN
    INSERT INTO public.statutory_computations (entity_id, obligation_id, formula_id, formula_version, statute_citation, inputs, result, result_unit)
      VALUES (ok_entity, ok_obligation, 'selftest_formula', '1', 'Art. 1', jsonb_build_array(jsonb_build_object('table', 'estimated_values', 'pk', ok_entity2, 'version', '1')), 1.0, 'EUR');
    rejected := false;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ABORT: assert_statutory_purity() failed to reject a statutory row whose inputs cite a live estimated_values row';
  END IF;
  -- Same refusal when the estimate is addressed by its surrogate PK (the shape register/seed code writes).
  DECLARE v_estimate uuid; rejected2 boolean;
  BEGIN
    SELECT estimate_id INTO v_estimate FROM public.estimated_values WHERE entity_id = ok_entity2 LIMIT 1;
    BEGIN
      INSERT INTO public.statutory_computations (entity_id, obligation_id, formula_id, formula_version, statute_citation, inputs, result, result_unit)
        VALUES (ok_entity, ok_obligation, 'selftest_formula', '1', 'Art. 1', jsonb_build_array(jsonb_build_object('table', 'estimated_values', 'pk', v_estimate::text, 'version', '1')), 1.0, 'EUR');
      rejected2 := false;
    EXCEPTION WHEN OTHERS THEN
      rejected2 := true;
    END;
    IF NOT rejected2 THEN
      RAISE EXCEPTION 'ABORT: assert_statutory_purity() failed to reject an estimate input addressed by estimate_id';
    END IF;
  END;

  -- Clean up: this migration must land with zero rows (schema-only), same posture as 258/282/283/284/285.
  -- ORDER MATTERS, AND GOT IT WRONG ON FIRST TRY (found live by this very self-check, kept as a comment so
  -- it is not silently reintroduced): the estimated_values INSERT above already fired the outbox trigger
  -- (migration 284's emit_propagation_event()) once; the DELETE FROM estimated_values two lines below
  -- fires it AGAIN (AFTER DELETE), inserting a SECOND propagation_events row referencing ok_entity2 — so
  -- clearing propagation_events BEFORE deleting from statutory_computations/estimated_values leaves a
  -- fresh row behind that then blocks the entities DELETE. The table/row-deletes that can themselves emit
  -- new outbox events must run FIRST; propagation_events is cleared LAST, after every trigger that could
  -- still write to it has already fired.
  DELETE FROM public.statutory_computations WHERE entity_id = ok_entity;
  DELETE FROM public.estimated_values WHERE entity_id = ok_entity2;
  DELETE FROM public.propagation_events WHERE entity_id IN (ok_entity, ok_entity2, ok_obligation);
  DELETE FROM public.entities WHERE entity_id IN (ok_entity, ok_entity2, ok_obligation);

  IF (SELECT count(*) FROM public.statutory_computations) <> 0 OR (SELECT count(*) FROM public.estimated_values) <> 0 THEN
    RAISE EXCEPTION 'ABORT: self-check rows were not fully cleaned up';
  END IF;

  RAISE NOTICE 'migration 286 OK: statutory_computations (% cols) + estimated_values (% cols), assert_statutory_purity proven live (rejects an estimate-touching input), RLS on, 0 rows', n_sc_cols, n_ev_cols;
END $$;
