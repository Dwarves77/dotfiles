-- 296 — spec 09 Market Intel domain tables: OEM equipment roadmap (§1.1), carrier compliance pooling +
-- surcharge audit (§1.2), dynamic carbon contract indexation (§1.3), geopolitical rerouting multipliers
-- (§1.7). Lane SPEC-09, wave 3, 2026-09-03 (docs/specs/09-domain-extensions.md;
-- docs/plans/wave3-lanes-2026-09-03.md).
--
-- WHAT THIS IS. Five new tables, corridor- and entity-spine-keyed, schema-only (0 rows — the same
-- "structure now, numbers separately" posture migrations 258/282/283/286/290 all take). Every producer
-- that could write into these tables (fsi-app/scripts/spec09/**, same commit) ships DRY-BY-DEFAULT and
-- --apply is never exercised by this lane; the coordinator applies data separately, per CLAUDE.md standing
-- rule 3 (schema DDL before dependent code, data migrations after merge).
--
-- SEQUENCED PER SPEC §4: surcharge_audits is built first inside this file (and was the first calculator/
-- producer/component built in this lane) — "the only [Market Intel component] with an immediate cash
-- payback to the user... every other Market Intel component gets better with that corpus." Table order in
-- this file follows: surcharge_audits + its supporting carrier_compliance_pools, then oem_tech_roadmaps,
-- indexation_clauses, reroute_events.
--
-- ── DEVIATION FROM SPEC 09's OWN ILLUSTRATIVE DDL, STATED ONCE HERE (applies to every table below) ──────
-- Spec 09 §1.1/§1.2/§1.3/§1.7 each give a `CREATE TABLE ... (entity_id text PRIMARY KEY REFERENCES
-- entities(entity_id), ...)` block — the row's OWN identity doubling as an entity-spine id. That is the
-- EXACT shape migration 286's header already found broken and fixed for statutory_computations/
-- estimated_values (see that migration's 2026-09-02 amendment note in full): `entity_kind` (migration 282)
-- has eleven values — corridor, node, jurisdiction, organisation, asset, instrument, obligation, method,
-- technology, signpost, person — and NONE of them means "a surcharge audit row" or "an OEM roadmap row".
-- Minting a fresh entities row per domain-fact row would require a twelfth kind this lane's write set does
-- not include (migration numbers are assigned by the coordinator; entities/entity_kind is COMMUNITY-A's
-- and CORR's territory, not this lane's). Every table below therefore takes migration 286's own fix,
-- generalised: a surrogate uuid PK for the row itself, and `entity_id` is NEVER used as a column name here
-- — the spec's own domain-specific FK column (corridor_id / manufacturer_id / carrier_id / index_id /
-- baseline_corridor_id / reroute_corridor_id) already names the SUBJECT precisely, and repeating that
-- subject under a second, generic `entity_id` column would be a redundant alias for the same fact, not a
-- new one. Every one of those FK columns targets `public.entities(entity_id)` — kind expected is named in
-- each column's COMMENT (not enforced by a DB-level kind CHECK, matching migration 282's own entity_scope
-- table: "closed vocabulary... NOT enforced here", the same "transcribe, don't improve on" restraint).
--
-- ONE FURTHER NAMED DEVIATION — `source_id`. Spec §1.1's oem_tech_roadmaps gives `source_id text NOT NULL
-- REFERENCES entities(entity_id)`. `entity_kind` has no "source" kind either, and this codebase already
-- has the correct target for "which registry source made this claim": `public.sources(id)` (uuid) — the
-- SAME table `intelligence_items.source_id` and every other source citation in this schema points at
-- (migration 283 goes the OTHER direction on purpose: `sources.organisation_entity_id` names which
-- ENTITY *publishes* a source, never the reverse). `source_id` below is `uuid REFERENCES public.sources(id)`,
-- not text/entities — this is adopting the codebase's own existing convention, not inventing a new one.
--
-- ── ORIGIN_CLASS / DERIVATION — THE SHARED VOCABULARY, NOT SPEC 09's OWN NARROWED/BUGGY SUBSET ──────────
-- Spec §1.1's oem_tech_roadmaps CHECK is `origin_class ... CHECK (origin_class IN ('official','partner'))
-- DEFAULT 'community'` — a DEFAULT value the table's own CHECK would then reject on the very first
-- untouched insert. Rather than transcribe a self-contradicting CHECK (or silently "fix" it by picking one
-- side unstated), every origin_class / derivation column below uses the FULL, CANONICAL vocabularies this
-- product already has exactly one definition of: `src/lib/contracts/vocabularies.mjs` ORIGIN_CLASSES (7
-- values) and `src/lib/contracts/envelope.mjs` DERIVATIONS (9 values) — spec 00 §3's "adopt, do not invent"
-- rule applied to spec 09's own text. The value lists below are hand-transcribed from those two modules
-- (confirmed byte-for-byte via `node -e` against both exports while authoring this migration) and are
-- drift-guarded from the JS side by `fsi-app/src/lib/spec09/vocab-drift.test.mjs` (same commit), which
-- reads this file's own CHECK text and asserts it names exactly ORIGIN_CLASSES / DERIVATIONS — the same
-- "regenerate and byte-compare" posture corridor-id.mjs's SQL twin uses, applied without a codegen script
-- (out of this lane's write set) by testing the checked-in SQL text directly instead.
--
-- ── RLS POSTURE — mirrors migration 286 exactly (statutory_computations/estimated_values): customer-
-- figure-backing tables, SELECT-only to `authenticated`, no INSERT/UPDATE/DELETE policy (writes are
-- service-role only, via scripts/spec09/** through the guarded scripts/lib/db.mjs path). NOT the wider
-- migration 282 "world-readable" posture: these rows carry commercial figures (billed/statutory EUR,
-- contract references, OEM payload economics) rather than bare identity, the same class of content
-- migration 286 reasoned about for its own two tables.
--
-- SELF-CHECK ONLY, applied against a minimal hand-built fixture (entity_kind enum + entities + sources,
-- the two upstream tables this file's FKs target) during authoring — NOT the full origin/master migration
-- chain (296 prior migrations were impractical to replay in this lane's session; the coordinator applies
-- this migration for real, per the two-track policy). Every post-check below runs against whatever spine
-- is live at apply time.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist — migration 004 must be applied first';
  END IF;
END $$;

-- ── carrier_compliance_pools (spec §1.2, FuelEU pooling arbitrage) ─────────────────────────────────────
-- Built ahead of surcharge_audits in file order only because surcharge_audits.pool_id FKs into it; the
-- BUILD sequence (calculator/producer/component) still put surcharge audit first, per spec §4.
CREATE TABLE IF NOT EXISTS public.carrier_compliance_pools (
  pool_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id           text NOT NULL REFERENCES public.entities(entity_id),
  compliance_year      int  NOT NULL,
  pool_surplus_gco2e   numeric,
  pool_deficit_gco2e   numeric,
  implied_clearing_eur_per_t numeric,
  derivation           text NOT NULL DEFAULT 'modelled',
  method_id            text NOT NULL CHECK (length(method_id) > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carrier_compliance_pools_carrier_year_uniq UNIQUE (carrier_id, compliance_year),
  CONSTRAINT carrier_compliance_pools_derivation_check CHECK (derivation IN (
    'statutory_fixed','statutory_formula','observed','transacted_index','assessed','calculated',
    'interpolated','modelled','estimated'
  )),
  -- Spec's own words: "inferred from public data; say so loudly" — a pool position is NEVER the statute's
  -- own arithmetic (that is surcharge_audits.statutory_eur, a different figure, in a different table).
  -- Mechanised so the discipline does not depend on every future writer remembering the sentence.
  CONSTRAINT carrier_compliance_pools_never_statutory CHECK (derivation NOT IN ('statutory_fixed','statutory_formula'))
);

COMMENT ON TABLE public.carrier_compliance_pools IS
  'Spec 09 §1.2: an inferred FuelEU Maritime compliance-pool position per carrier per year, from public '
  'THETIS-MRV-class vessel data. ALWAYS modelled (see carrier_compliance_pools_never_statutory) — spec 09 '
  '§5 open decision 1 is taken with its own conservative default: this table is written and may be read '
  'internally, but pool_adjusted_eur on surcharge_audits (the only customer-facing surface that could cite '
  'it) is never populated by this lane''s producer — src/lib/spec09/surcharge-audit.mjs''s '
  'poolAdjustedGuard() refuses to surface it. Publishing the inference is an operator decision, not a '
  'technical one (spec 09 §5 item 1), and stays unmade here.';
COMMENT ON COLUMN public.carrier_compliance_pools.carrier_id IS
  'entities(entity_id), kind expected = organisation (the carrier). Not DB-enforced — see this migration''s '
  'header note on entity kind CHECKs.';
COMMENT ON COLUMN public.carrier_compliance_pools.implied_clearing_eur_per_t IS
  'What clearing ACTUALLY cost the carrier (spec text) — modelled, never presented as their statutory '
  'liability. See table comment: not surfaced to a customer by this lane.';

CREATE INDEX IF NOT EXISTS carrier_compliance_pools_carrier_idx ON public.carrier_compliance_pools (carrier_id);

-- ── surcharge_audits (spec §1.2, the monetisation loop — built FIRST per spec §4) ─────────────────────
CREATE TABLE IF NOT EXISTS public.surcharge_audits (
  audit_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id      text NOT NULL REFERENCES public.entities(entity_id),
  carrier_id       text NOT NULL REFERENCES public.entities(entity_id),
  invoice_line     text NOT NULL CHECK (length(invoice_line) > 0),
  billed_eur       numeric NOT NULL CHECK (billed_eur >= 0),          -- observed, from the customer's own invoice
  statutory_eur    numeric NOT NULL CHECK (statutory_eur >= 0),       -- statutory_formula: the real liability
  statutory_basis  text NOT NULL CHECK (length(statutory_basis) > 0), -- provision cited
  statutory_derivation text NOT NULL DEFAULT 'statutory_formula',
  variance_eur     numeric GENERATED ALWAYS AS (billed_eur - statutory_eur) STORED,
  pool_adjusted_eur numeric,
  pool_id          uuid REFERENCES public.carrier_compliance_pools(pool_id),
  origin_class     text NOT NULL DEFAULT 'derived',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surcharge_audits_statutory_derivation_check CHECK (statutory_derivation IN ('statutory_fixed','statutory_formula')),
  CONSTRAINT surcharge_audits_origin_class_check CHECK (origin_class IN (
    'community','community-corroborated','modelled','derived','partner','verified','official'
  )),
  -- The isolation discipline the spec calls out by name: a pool-adjusted figure on this table must always
  -- trace to a live pool row (never a bare number with no modelled basis attached).
  CONSTRAINT surcharge_audits_pool_adjusted_requires_pool CHECK (pool_adjusted_eur IS NULL OR pool_id IS NOT NULL)
);

COMMENT ON TABLE public.surcharge_audits IS
  'Spec 09 §1.2, built first in this lane per spec §4 ("the only [component] with an immediate cash '
  'payback"). Two customer-facing sentences this table keeps categorically apart (spec text, verbatim '
  'intent): "your billed surcharge exceeds the statutory liability by €X" (variance_eur, defensible, '
  'billed vs statutory) is ALWAYS renderable; "your carrier is overcharging you by €Y" (pool_adjusted_eur, '
  'an accusation requiring the inferred pool position) is NEVER rendered by this lane — spec 09 §5 open '
  'decision 1''s conservative default. src/lib/spec09/surcharge-audit.mjs is the one place both sentences '
  'are formatted; every renderer must call it rather than composing either sentence itself.';
COMMENT ON COLUMN public.surcharge_audits.corridor_id IS
  'entities(entity_id), kind expected = corridor. Not DB-enforced — see this migration''s header note.';
COMMENT ON COLUMN public.surcharge_audits.carrier_id IS
  'entities(entity_id), kind expected = organisation. Not DB-enforced — see this migration''s header note.';
COMMENT ON COLUMN public.surcharge_audits.variance_eur IS
  'billed_eur - statutory_eur, GENERATED (never independently writable, cannot drift from its two inputs). '
  'Positive means the invoice line billed more than the statute requires.';
COMMENT ON COLUMN public.surcharge_audits.pool_adjusted_eur IS
  'Modelled, inferred from carrier_compliance_pools — see that table''s own comment and spec 09 §5 open '
  'decision 1. Column exists for a future operator decision to publish; this lane''s producer/renderer '
  'never populates or displays it.';

CREATE INDEX IF NOT EXISTS surcharge_audits_corridor_idx ON public.surcharge_audits (corridor_id);
CREATE INDEX IF NOT EXISTS surcharge_audits_carrier_idx ON public.surcharge_audits (carrier_id);

-- ── oem_tech_roadmaps (spec §1.1, OEM equipment roadmap) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oem_tech_roadmaps (
  roadmap_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id  text NOT NULL REFERENCES public.entities(entity_id),
  tech_category    text NOT NULL CHECK (tech_category IN
                     ('heavy_battery','megawatt_charging','hydrogen_fcell','ammonia_engine',
                      'methanol_dualfuel','saf_refinery','e_axle','reefer_electrification')),
  commercial_stage text NOT NULL CHECK (commercial_stage IN
                     ('announced','pilot_demonstration','small_batch_fleet','mass_series_production')),
  target_year      int,
  energy_density_wh_kg numeric,
  density_basis    text CHECK (density_basis IN ('cell','module','pack')),
  c_rate_max       numeric,
  usable_kwh       numeric,
  announced_at     date NOT NULL,
  source_id        uuid NOT NULL REFERENCES public.sources(id),
  origin_class     text NOT NULL DEFAULT 'community',
  derivation       text NOT NULL DEFAULT 'observed',
  confidence_admiralty text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oem_tech_roadmaps_origin_class_check CHECK (origin_class IN (
    'community','community-corroborated','modelled','derived','partner','verified','official'
  )),
  CONSTRAINT oem_tech_roadmaps_derivation_check CHECK (derivation IN (
    'statutory_fixed','statutory_formula','observed','transacted_index','assessed','calculated',
    'interpolated','modelled','estimated'
  )),
  -- A density figure with no stated basis is unusable for the payload-penalty maths (spec 09 §5 open
  -- decision 3: "cell-level flatters by 20-30%... store which, and refuse to mix" — mechanised, not just
  -- documented, so a future writer cannot silently drop density_basis while keeping the number).
  CONSTRAINT oem_tech_roadmaps_density_requires_basis CHECK (energy_density_wh_kg IS NULL OR density_basis IS NOT NULL),
  -- Admiralty pair shape (src/lib/contracts/vocabularies.mjs SOURCE_RELIABILITY x INFO_CREDIBILITY):
  -- letter A-F + digit 1-6, e.g. "B2". Not a FK to a vocab table (vocabularies.mjs is the JS-side single
  -- source of truth; this is a cheap shape guard, matching this schema's "DB shape, application validates
  -- content" posture for other small closed codes).
  CONSTRAINT oem_tech_roadmaps_confidence_admiralty_shape CHECK (confidence_admiralty IS NULL OR confidence_admiralty ~ '^[A-F][1-6]$')
);

COMMENT ON TABLE public.oem_tech_roadmaps IS
  'Spec 09 §1.1: OEM equipment roadmap, TRL 7-9, the bridge between Research (TRL 1-6) and Market Intel '
  'spot rates. An OEM announcement is a VENDOR claim (spec text) — typically confidence_admiralty B2/C2, '
  'never treated as verified capability. Feeds src/lib/spec09/oem-payload.mjs''s payload-penalty-delta and '
  '"not forecastable" TCO-crossover refusal.';
COMMENT ON COLUMN public.oem_tech_roadmaps.manufacturer_id IS
  'entities(entity_id), kind expected = organisation. Not DB-enforced — see this migration''s header note.';
COMMENT ON COLUMN public.oem_tech_roadmaps.source_id IS
  'public.sources(id) — the registry source that carried the OEM claim (NOT entities; see this migration''s '
  'header "ONE FURTHER NAMED DEVIATION" note). NOT NULL: an OEM announcement with no citable source is not '
  'evidence of intent, it is unsourced.';
COMMENT ON COLUMN public.oem_tech_roadmaps.energy_density_wh_kg IS
  'PACK level only when density_basis=''pack''. Spec 09 §5 open decision 3, taken with its conservative '
  'default: src/lib/spec09/oem-payload.mjs computes a payload-penalty delta ONLY when density_basis=''pack''; '
  'cell/module-basis rows render M (missing) for that derived figure rather than a flattered pack estimate.';
COMMENT ON COLUMN public.oem_tech_roadmaps.origin_class IS
  'Full 7-value vocabulary (src/lib/contracts/vocabularies.mjs ORIGIN_CLASSES), NOT spec 09''s own narrower '
  'illustrative CHECK — see this migration''s header. DEFAULT ''community'' is a valid member of the full '
  'vocabulary (it was not a valid member of spec text''s own two-value CHECK, which is the bug this '
  'migration does not repeat).';

CREATE INDEX IF NOT EXISTS oem_tech_roadmaps_manufacturer_idx ON public.oem_tech_roadmaps (manufacturer_id);
CREATE INDEX IF NOT EXISTS oem_tech_roadmaps_category_idx ON public.oem_tech_roadmaps (tech_category);

-- ── indexation_clauses (spec §1.3, dynamic carbon contract indexation) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.indexation_clauses (
  clause_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_ref    text,
  corridor_id     text REFERENCES public.entities(entity_id),
  index_id        text NOT NULL REFERENCES public.entities(entity_id),  -- EUA front-Dec, UKA, TTF
  base_value      numeric NOT NULL,
  base_date       date NOT NULL,
  passthrough_pct numeric NOT NULL CHECK (passthrough_pct BETWEEN 0 AND 100),
  cap_pct         numeric,
  floor_pct       numeric,
  review_cadence  text NOT NULL CHECK (review_cadence IN ('monthly','quarterly','semiannual')),
  rounding_rule   text NOT NULL CHECK (length(rounding_rule) > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indexation_clauses_cap_floor_ordered CHECK (cap_pct IS NULL OR floor_pct IS NULL OR floor_pct <= cap_pct)
);

COMMENT ON TABLE public.indexation_clauses IS
  'Spec 09 §1.3: dynamic carbon contract indexation MECHANICS AND ARITHMETIC ONLY (spec 09 §5 open decision '
  '2, taken with its conservative default) — this table and src/lib/spec09/indexation.mjs never produce '
  'drafted clause TEXT. "The product supplies the obligation, the index and the computation; the customer''s '
  'counsel supplies the contract" (spec text).';
COMMENT ON COLUMN public.indexation_clauses.corridor_id IS
  'entities(entity_id), kind expected = corridor. Nullable (spec text: a contract need not be corridor-'
  'specific). Not DB-enforced — see this migration''s header note.';
COMMENT ON COLUMN public.indexation_clauses.index_id IS
  'entities(entity_id), kind expected = instrument (EUA front-Dec, UKA, TTF). Not DB-enforced — see this '
  'migration''s header note.';

CREATE INDEX IF NOT EXISTS indexation_clauses_corridor_idx ON public.indexation_clauses (corridor_id) WHERE corridor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS indexation_clauses_index_idx ON public.indexation_clauses (index_id);

-- ── reroute_events (spec §1.7, geopolitical rerouting multipliers) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reroute_events (
  reroute_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_corridor_id text NOT NULL REFERENCES public.entities(entity_id),
  reroute_corridor_id  text NOT NULL REFERENCES public.entities(entity_id),  -- a DIFFERENT corridor entity
  cause                text NOT NULL CHECK (length(cause) > 0),
  distance_delta_nm    numeric,
  transit_delta_days   numeric,
  fuel_burn_multiplier numeric NOT NULL CHECK (fuel_burn_multiplier > 0),
  effective_from       date NOT NULL,
  effective_to         date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reroute_events_distinct_corridors CHECK (baseline_corridor_id <> reroute_corridor_id),
  CONSTRAINT reroute_events_effective_range_ordered CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.reroute_events IS
  'Spec 09 §1.7: the corridor-fix motivator (spec 09 §0 — the defect this whole spec unit shipped to fix). '
  'baseline_corridor_id and reroute_corridor_id are DIFFERENT entities.kind=''corridor'' rows by construction '
  '(reroute_events_distinct_corridors) — the exact Suez-vs-Cape collision the old corridor-id scheme could '
  'not represent. src/lib/spec09/reroute.mjs applies fuel_burn_multiplier as a scaling function and names '
  'the five-surface compounding chain (spec text) for the UI notice; it does NOT compute the bracketed '
  'FuelEU/EU-ETS penalty itself ("a single scalar multiplier applied at the end would get this wrong" — '
  'spec text — that bracket arithmetic belongs to the statutory_computations domain, out of this table''s '
  'and this lane''s scope).';
COMMENT ON COLUMN public.reroute_events.baseline_corridor_id IS
  'entities(entity_id), kind expected = corridor. Not DB-enforced — see this migration''s header note.';
COMMENT ON COLUMN public.reroute_events.reroute_corridor_id IS
  'entities(entity_id), kind expected = corridor, and REQUIRED to differ from baseline_corridor_id '
  '(reroute_events_distinct_corridors) — a reroute that resolves to the same corridor id is not a reroute.';

CREATE INDEX IF NOT EXISTS reroute_events_baseline_idx ON public.reroute_events (baseline_corridor_id);
CREATE INDEX IF NOT EXISTS reroute_events_reroute_idx ON public.reroute_events (reroute_corridor_id);

-- ── RLS — mirrors migration 286 (statutory_computations/estimated_values): SELECT-only to authenticated,
-- no write policy (service-role only, via scripts/spec09/** through the guarded db.mjs path) ────────────
ALTER TABLE public.carrier_compliance_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surcharge_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_tech_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexation_clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reroute_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_compliance_pools_read ON public.carrier_compliance_pools;
CREATE POLICY carrier_compliance_pools_read ON public.carrier_compliance_pools FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS surcharge_audits_read ON public.surcharge_audits;
CREATE POLICY surcharge_audits_read ON public.surcharge_audits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS oem_tech_roadmaps_read ON public.oem_tech_roadmaps;
CREATE POLICY oem_tech_roadmaps_read ON public.oem_tech_roadmaps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS indexation_clauses_read ON public.indexation_clauses;
CREATE POLICY indexation_clauses_read ON public.indexation_clauses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS reroute_events_read ON public.reroute_events;
CREATE POLICY reroute_events_read ON public.reroute_events FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.carrier_compliance_pools, public.surcharge_audits, public.oem_tech_roadmaps,
  public.indexation_clauses, public.reroute_events TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols int;
  n_rows int;
  rejected boolean;
  ok_corridor_a text := 'cl:corridor:0000000000000101';
  ok_corridor_b text := 'cl:corridor:0000000000000102';
  ok_org text := 'cl:organisation:0000000000000103';
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='carrier_compliance_pools';
  IF n_cols <> 9 THEN RAISE EXCEPTION 'ABORT: carrier_compliance_pools has % columns, expected 9', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='surcharge_audits';
  IF n_cols <> 13 THEN RAISE EXCEPTION 'ABORT: surcharge_audits has % columns, expected 13', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='oem_tech_roadmaps';
  IF n_cols <> 15 THEN RAISE EXCEPTION 'ABORT: oem_tech_roadmaps has % columns, expected 15', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='indexation_clauses';
  IF n_cols <> 12 THEN RAISE EXCEPTION 'ABORT: indexation_clauses has % columns, expected 12', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='reroute_events';
  IF n_cols <> 10 THEN RAISE EXCEPTION 'ABORT: reroute_events has % columns, expected 10', n_cols; END IF;

  -- Adversarial proof (rule 15: "attack, don't assert presence") — carrier_compliance_pools must REFUSE a
  -- statutory derivation, live, not merely by CHECK-text inspection.
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_org, 'organisation', 'selftest carrier') ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO public.carrier_compliance_pools (carrier_id, compliance_year, derivation, method_id)
      VALUES (ok_org, 2026, 'statutory_formula', 'selftest-method');
    rejected := false;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ABORT: carrier_compliance_pools accepted a statutory_formula derivation — the never-statutory CHECK failed to fire';
  END IF;

  -- Adversarial proof — reroute_events must REFUSE identical baseline/reroute corridors (the exact
  -- Suez/Cape collision this table exists to make unrepresentable).
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_corridor_a, 'corridor', 'selftest corridor A') ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO public.reroute_events (baseline_corridor_id, reroute_corridor_id, cause, fuel_burn_multiplier, effective_from)
      VALUES (ok_corridor_a, ok_corridor_a, 'selftest', 1.3, '2026-01-01');
    rejected := false;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ABORT: reroute_events accepted baseline_corridor_id = reroute_corridor_id';
  END IF;

  -- Clean up (schema-only migration, 0 rows at rest).
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_corridor_b, 'corridor', 'selftest corridor B') ON CONFLICT DO NOTHING;
  DELETE FROM public.carrier_compliance_pools WHERE carrier_id = ok_org;
  DELETE FROM public.entities WHERE entity_id IN (ok_org, ok_corridor_a, ok_corridor_b);

  SELECT count(*) INTO n_rows FROM public.carrier_compliance_pools; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: carrier_compliance_pools not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.surcharge_audits; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: surcharge_audits not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.oem_tech_roadmaps; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: oem_tech_roadmaps not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.indexation_clauses; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: indexation_clauses not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.reroute_events; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: reroute_events not empty'; END IF;

  RAISE NOTICE 'migration 296 OK: 5 tables created (carrier_compliance_pools, surcharge_audits, oem_tech_roadmaps, indexation_clauses, reroute_events), adversarial CHECKs proven live, RLS on, 0 rows';
END $$;
