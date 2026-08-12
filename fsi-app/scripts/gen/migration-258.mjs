#!/usr/bin/env node
// Generator for supabase/migrations/258_emission_factors_and_licence_gate.sql.
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN MIGRATION. Four blocks of this migration are derived from
// modules that are already the single definition of their doctrine: the licence register, the tier
// hierarchy and its pedigree floors, the scope discriminator, and the corridor identity hash. Typing any
// of them into SQL by hand creates a second copy that drifts, which is the exact defect F24's header
// documents in the fifteen gate_a_* functions. The blocks are spliced in between markers, and
// src/__tests__/migration-258-codegen-drift.test.mjs regenerates them and byte-compares, so an edit to
// either side without the other is RED.
//
// Re-run with:  node scripts/gen/migration-258.mjs
// It rewrites the migration in place. Committing the regenerated diff is how a register change ships.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderDataSourceSeedSql, REDISTRIBUTION_CODES } from "../../src/lib/contracts/source-licence.mjs";
import {
  renderTierConstraintsSql, renderEnvelopeColumnsSql, renderFactorCandidateViewSql,
} from "../../src/lib/contracts/factor-tier.mjs";
import { renderCorridorIdSql } from "../../src/lib/contracts/corridor-id.mjs";

export const MARKERS = {
  data_source_seed: renderDataSourceSeedSql,
  corridor_id_functions: renderCorridorIdSql,
  tier_constraints: renderTierConstraintsSql,
  envelope_columns: renderEnvelopeColumnsSql,
  candidate_view: renderFactorCandidateViewSql,
};

export function block(name) {
  return `-- >>> GENERATED: ${name} >>>\n${MARKERS[name]()}\n-- <<< END GENERATED: ${name} <<<`;
}

export function renderMigration() {
  const redistCheck = REDISTRIBUTION_CODES.map((c) => `'${c}'`).join(", ");

  return `-- 258 — emission factors, the source licence register, and the licence gate as an enforced
-- database object (2026-08-12).
--
-- WHAT THIS REPLACES. The two hardcoded allowlists that the F1-F5 foundation modules carried while their
-- consumer tables did not exist. src/lib/contracts/source-licence.mjs held the licence verdicts and
-- src/lib/contracts/factor-tier.mjs held the tier hierarchy, both enforced only in application code, and
-- both carried an F25 LEGACY_ALLOWLIST entry naming THIS migration as the landing point that deletes
-- them. Those entries are deleted in the same commit as this file. If you are reading this and they are
-- still in F25-module-liveness.mjs, that is a review failure, not a follow-up.
--
-- THE DESIGN DECISION THAT SHAPES EVERYTHING BELOW: emission factors do not share one key.
--
-- The obvious schema is (corridor_id, mode) and it is wrong for four of the five tiers. UK DESNZ and US
-- EPA publish by mode, vehicle class and fuel with NO lane. EMSA THETIS-MRV aggregates to an operator.
-- Clean Cargo aggregates to a carrier and a trade lane. Only carrier primary data is about a specific
-- movement. Forcing all four shapes through one key gives you either a corridor column that is NULL for
-- the whole of v1, which is the orphaned-field class Phase 0.3 exists to delete, or invented corridors on
-- factors that were never lane-specific, which is worse: a missing claim is a gap, a fabricated one is a
-- defect that survives audit because it looks complete.
--
-- So the table carries scope_kind as a discriminator and a per-kind CHECK saying which dimensions that
-- kind REQUIRES and which it FORBIDS. A modal default physically cannot store an operator. A carrier lane
-- factor physically cannot omit its corridor.
--
-- WHAT IS DELIBERATELY NOT HERE, each with its reason:
--
--   NO FACTOR ROWS. This migration creates the structure and seeds the LICENCE REGISTER only. The DESNZ
--   and EPA numbers are a separate unit with their own verification, because a factor row asserts a
--   physical quantity and a schema does not. Shipping structure and data together would mean one review
--   covering both a design and several hundred numbers, and the numbers would not get read.
--
--   NO corridors TABLE, and no foreign key from emission_factors.corridor_id. The corridor identity
--   FUNCTIONS land here because they are pure and content-addressed: cl_corridor_id() derives a key from
--   the route itself, so the key is self-validating and needs no parent row to be meaningful. The
--   corridors ENTITY, with its attributes and its FK, belongs to the spine unit. A CHECK on the key
--   pattern gives the integrity a premature FK would give, without pulling an unspecified entity model
--   forward.
--
--   NO ANTITRUST k-ANONYMITY CONSTRAINT. It was drafted and removed. k>=5 distinct organisations and the
--   25% dominance cap protect a CROSS-ORGANISATION BENCHMARK. A verified_operator_avg is one operator's
--   own ships aggregated from EMSA THETIS-MRV, which is statutory public per-ship disclosure under
--   Regulation (EU) 2015/757 Article 21. There is no confidentiality interest to protect and no
--   competitor whose data is being pooled. Putting the constraint here anyway would enforce nothing real
--   and would teach the next reader that these constraints are decoration. It belongs on the benchmark
--   surface, where the pooling actually happens.
--
--   NOTHING SCHEDULED, NOTHING ARMED. No pg_cron entry, no pg_net call, no trigger that reaches outside
--   the database. The only trigger here refuses writes.
--
-- APPEND-ONLY, AND WHY IT IS A TRIGGER RATHER THAN A CONVENTION. A factor that has been used to compute a
-- served number must never change in place, or every historical claim silently becomes a different claim
-- and the audit trail describes a state that no longer exists. Correction happens by inserting the
-- corrected row and pointing superseded_by at it. The trigger permits exactly two columns to change,
-- superseded_by and valid_to, which are the supersession mechanism itself.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'ABORT: pgcrypto is required — cl_corridor_id() uses digest() and must match Node createHash(sha256)';
  END IF;
END $$;

-- ── The source licence register ──────────────────────────────────────────────────────────────────────
-- The application gate (mayEmbedAsSeed / assertEmbeddable) and this table are the SAME verdicts, because
-- the seed below is generated from the module rather than transcribed.
CREATE TABLE IF NOT EXISTS public.data_sources (
  source_key      text PRIMARY KEY,
  name            text NOT NULL,
  redistribution  text NOT NULL CHECK (redistribution IN (${redistCheck})),
  embeddable      boolean NOT NULL,
  licence         text,
  attribution     text,
  url             text,
  verified_on     date,
  blocker         text,       -- why a prohibited source is prohibited
  ask_who         text,       -- for a conditional source: who discharges the condition
  ask_what        text,       -- and what exactly to ask them
  substitute      text,       -- the licence-safe replacement, where one exists
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- embeddable is DERIVED from redistribution, never independently set. Storing both without binding
  -- them is how a prohibited source ends up flagged embeddable by a careless UPDATE.
  CONSTRAINT data_sources_embeddable_matches_verdict CHECK (embeddable = (redistribution = 'permitted'))
);

COMMENT ON TABLE public.data_sources IS
  'Licence verdicts per data source. Generated from src/lib/contracts/source-licence.mjs. '
  'Unregistered sources fail closed: absence from this table means NOT embeddable, never unknown.';

${block("data_source_seed")}

-- THE GATE. Every read path that serves data joins through this view rather than trusting a source_key.
CREATE OR REPLACE VIEW public.licence_clear_sources AS
SELECT source_key, name, attribution, licence, url, verified_on
FROM public.data_sources
WHERE embeddable IS TRUE;

COMMENT ON VIEW public.licence_clear_sources IS
  'Sources we may lawfully embed and re-serve. The database half of the licence gate; '
  'src/lib/contracts/source-licence.mjs is the application half, and both derive from one register.';

-- ── Corridor identity ────────────────────────────────────────────────────────────────────────────────
-- Pure, immutable, content-addressed. No table dependency by design: the key IS the route, so it can be
-- minted and compared before the corridors entity exists. Length-prefixed fields kill delimiter
-- injection as a class, and the via[] array is part of the payload so a Cape reroute and a Suez routing
-- hash DIFFERENTLY, which is the collision an external review found in the previous scheme.
${block("corridor_id_functions")}

-- ── Emission factors ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emission_factors (
    factor_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tier            text NOT NULL,
    scope_kind      text NOT NULL,

    -- Scope dimensions. Which of these are required and which are forbidden is decided per scope_kind by
    -- the generated CHECK block below, not by convention.
    -- No inline CHECK here on purpose: the mode vocabulary is codegen'd into the generated
    -- constraints block below, from LEG_MODE_CODES. An inline copy is a second definition that
    -- drifts, which is the exact defect this generator exists to prevent.
    mode            text NOT NULL,
    vehicle_class   text,
    energy_carrier  text,
    jurisdiction    text,       -- ISO 3166-1 alpha-2, or 'EU' / 'GLOBAL'
    grid_region     text,       -- for electrified modes, where grid intensity decides the answer
    operator_key    text,
    corridor_id     text CHECK (corridor_id IS NULL OR corridor_id ~ '^cl:corridor:[0-9a-f]{16}$'),
    movement_ref    text,

    -- The number, decomposed. ISO 14083 reports well-to-wake, which is well-to-tank plus tank-to-wake.
    -- Storing only the total makes the split unrecoverable, and the split is what FuelEU Maritime and the
    -- EU ETS actually regulate. Sources vary in what they publish, so at least one is required rather
    -- than all three.
    quantity_basis  text NOT NULL,
    wtt_co2e        numeric CHECK (wtt_co2e >= 0),
    ttw_co2e        numeric CHECK (ttw_co2e >= 0),
    wtw_co2e        numeric CHECK (wtw_co2e >= 0),

    -- Gas species where published, and the GWP basis that converted them. CO2e is a calculation, not a
    -- measurement, and its coefficients change between IPCC assessment reports.
    co2_fossil      numeric CHECK (co2_fossil >= 0),
    co2_biogenic    numeric CHECK (co2_biogenic >= 0),
    ch4             numeric CHECK (ch4 >= 0),
    n2o             numeric CHECK (n2o >= 0),
    gwp_basis       text NOT NULL,

    -- Assumptions baked into a published factor. Without these, a vehicle-km figure cannot be converted
    -- to tonne-km honestly, and the conversion is where most real-world error enters.
    load_factor_pct    numeric CHECK (load_factor_pct > 0 AND load_factor_pct <= 100),
    empty_running_pct  numeric CHECK (empty_running_pct >= 0 AND empty_running_pct < 100),

    -- Provenance and the number envelope.
    source_key      text NOT NULL REFERENCES public.data_sources(source_key),
    source_ref      text,       -- the table, row or page within the source, so a reader can check it
    donor           text,       -- required for proxy_estimate: what was borrowed from
    n_observations  integer CHECK (n_observations > 0),
${block("envelope_columns")}

    -- Time. as_at_date is when the source asserted it; valid_from/valid_to is the movement window it
    -- applies to. They are different questions and conflating them makes point-in-time restatement
    -- impossible, which is a reporting requirement rather than a nicety.
    as_at_date      date NOT NULL,
    valid_from      date NOT NULL,
    valid_to        date,
    superseded_by   uuid REFERENCES public.emission_factors(factor_id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT emission_factors_has_a_number CHECK (num_nonnulls(wtt_co2e, ttw_co2e, wtw_co2e) >= 1),
    -- When all three are stated they must agree. A published split that does not add up is a
    -- transcription error, and it is far cheaper to reject at write than to explain at audit.
    CONSTRAINT emission_factors_wtw_decomposition CHECK (
      wtt_co2e IS NULL OR ttw_co2e IS NULL OR wtw_co2e IS NULL
      OR abs(wtw_co2e - (wtt_co2e + ttw_co2e)) <= 1e-9 * greatest(wtw_co2e, 1)
    ),
    CONSTRAINT emission_factors_valid_window CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT emission_factors_proxy_needs_donor CHECK (tier <> 'proxy_estimate' OR donor IS NOT NULL),
    CONSTRAINT emission_factors_not_self_superseded CHECK (superseded_by IS NULL OR superseded_by <> factor_id),
${block("tier_constraints")}
);

COMMENT ON TABLE public.emission_factors IS
  'Emission factors across five tiers and four scope kinds. Append-only: correct by inserting a new row '
  'and setting superseded_by, never by editing a factor a served number was computed from.';

-- ── Append-only enforcement ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emission_factors_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emission_factors is append-only: supersede the row instead of deleting it (factor_id=%)', OLD.factor_id;
  END IF;
  -- Only the supersession columns may move. Comparing the rest as a whole row means a column added later
  -- is protected by default rather than by remembering to extend this list.
  IF (to_jsonb(NEW) - 'superseded_by' - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by' - 'valid_to') THEN
    RAISE EXCEPTION 'emission_factors is append-only: only superseded_by and valid_to may change (factor_id=%)', OLD.factor_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS emission_factors_append_only_trg ON public.emission_factors;
CREATE TRIGGER emission_factors_append_only_trg
  BEFORE UPDATE OR DELETE ON public.emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.emission_factors_append_only();

-- ── Indexes ──────────────────────────────────────────────────────────────────────────────────────────
-- The v1 read path is entirely modal lookup, so that composite comes first. The partial indexes cost
-- almost nothing while their columns are NULL for every row, and exist so the operator and lane tiers do
-- not need a migration on the day they are first populated.
CREATE INDEX IF NOT EXISTS emission_factors_modal_lookup_idx
  ON public.emission_factors (mode, jurisdiction, energy_carrier, vehicle_class, valid_from DESC)
  WHERE scope_kind = 'modal' AND superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS emission_factors_operator_idx
  ON public.emission_factors (operator_key, mode, valid_from DESC) WHERE operator_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS emission_factors_corridor_idx
  ON public.emission_factors (corridor_id, mode, valid_from DESC) WHERE corridor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emission_factors_source_idx ON public.emission_factors (source_key);

-- ── Read model ───────────────────────────────────────────────────────────────────────────────────────
-- SQL owns ELIGIBILITY. JS owns SELECTION. See renderFactorCandidateViewSql() for why the winner is NOT
-- picked here: one doctrine implemented twice in two languages is the gate_a_* defect F24 was built to
-- find, and this module exists specifically to prevent JS and SQL disagreeing.
${block("candidate_view")}

COMMENT ON VIEW public.emission_factor_candidates IS
  'Licence-clear, in-window, non-superseded factors decorated with tier_rank and scope_specificity. '
  'Eligibility only. resolveActiveFactor() in src/lib/contracts/factor-tier.mjs picks the winner.';

-- ── RLS and grants ───────────────────────────────────────────────────────────────────────────────────
-- Deliberately NOT granted to anon. These are reference data for the served product, and the default for
-- a new surface is the narrower grant; widening later is a decision someone makes on purpose.
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_sources_read ON public.data_sources;
CREATE POLICY data_sources_read ON public.data_sources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS emission_factors_read ON public.emission_factors;
CREATE POLICY emission_factors_read ON public.emission_factors FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.data_sources, public.emission_factors TO authenticated;
GRANT SELECT ON public.licence_clear_sources, public.emission_factor_candidates TO authenticated;

-- No INSERT/UPDATE/DELETE policy is created. Writes arrive through the service role, which bypasses RLS,
-- so the seed loader still works while no end-user session can write a factor.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_sources int;
  n_clear   int;
  probe_a   text;
  probe_b   text;
BEGIN
  SELECT count(*) INTO n_sources FROM public.data_sources;
  SELECT count(*) INTO n_clear   FROM public.licence_clear_sources;
  IF n_sources = 0 THEN
    RAISE EXCEPTION 'ABORT: data_sources seeded zero rows';
  END IF;
  IF n_clear = 0 THEN
    RAISE EXCEPTION 'ABORT: no licence-clear sources — the gate would refuse every factor';
  END IF;
  IF n_clear >= n_sources THEN
    RAISE EXCEPTION 'ABORT: every source reads as embeddable (% of %) — the register lost its prohibited entries', n_clear, n_sources;
  END IF;

  -- The corridor collision the scheme exists to prevent: same endpoints, different routing.
  probe_a := cl_corridor_id('CNSHA', 'NLRTM', 'ocean', 1, 'suez', ARRAY['EGSUZ']);
  probe_b := cl_corridor_id('CNSHA', 'NLRTM', 'ocean', 1, 'cape',  ARRAY['ZACPT']);
  IF probe_a = probe_b THEN
    RAISE EXCEPTION 'ABORT: cl_corridor_id collides on routing — Suez and Cape hashed identically';
  END IF;
  IF probe_a !~ '^cl:corridor:[0-9a-f]{16}$' THEN
    RAISE EXCEPTION 'ABORT: cl_corridor_id returned a malformed key: %', probe_a;
  END IF;

  RAISE NOTICE 'migration 258 OK: % sources (% licence-clear), corridor identity live, emission_factors empty by design', n_sources, n_clear;
END $$;
`;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "..", "supabase", "migrations", "258_emission_factors_and_licence_gate.sql");

if (process.argv[1] && process.argv[1].endsWith("migration-258.mjs")) {
  writeFileSync(target, renderMigration(), "utf8");
  console.log(`wrote ${target}`);
}
