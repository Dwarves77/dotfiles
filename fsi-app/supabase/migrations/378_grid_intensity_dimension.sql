-- subject: Migration 378 (lane S8-E5, 2026-10-08, coordinator ruling A on spec 09 section 1.5): adds the seventh Operations dimension value `grid_intensity` to BOTH dimension CHECKs (regional_data_facts_dimension_check, migration 106, and region_dimension_coverage_dimension_check, migration 109, because the 109 trigger upserts the coverage table for every fact's dimension) and registers `data_sources.source_key='neso_carbon_intensity'` (NESO Carbon Intensity API, CC BY 4.0), the FK target of the new neso-carbon-intensity producer's facts. NOT APPLIED. Additive and reversible; the self-check attacks both guards inside a rolled-back sub-transaction.
-- 378 -- grid_intensity dimension and the NESO data_sources row (lane S8-E5, 2026-10-08).
--
-- NOT APPLIED. Authored by lane S8-E5; the coordinator's executor applies it. Two-track policy (CLAUDE.md standing
-- rule 3): schema DDL applies via the Supabase CLI BEFORE the dependent code merges. The producer this migration
-- serves (scripts/producers/regional/neso-carbon-intensity-producer.mjs) ships ENABLED=false and writes nothing on its
-- own, so the code is safe to merge before the apply; its first --apply needs this migration applied.
--
-- WHY. Ruling A (coordinator, 2026-10-08): GB grid carbon intensity is a regional fact, not a row of
-- auxiliary_energy_profiles. scripts/spec09/SOURCES.md already says the grid-intensity VALUE has its path through
-- regional_data_facts (migration 106); auxiliary_energy_profiles.grid_intensity_source only NAMES the source and stays
-- exactly as it is. regional_data_facts.dimension is a closed six-value CHECK.
--
-- WHY A NEW VALUE AND NOT ONE OF THE SIX. Read from the vocabulary's definitions, not guessed:
--   regional_resources   "Regional resource availability (materials, recyclables, qualified suppliers)"
--                        (caros-ledge-platform-intent SKILL.md line 116; OperationsLedger.tsx DIMENSIONS row 2). Grid
--                        carbon intensity is neither a material, a recyclate nor a supplier.
--   operational_cost     "Operational cost": prices of inputs (Eurostat nrg_pc_205 electricity price rows live here).
--                        gCO2/kWh is not a price.
--   infrastructure       "Infrastructure capacity": ports, rail, airports, charging density. Not an emissions factor.
--   labor_markets, materials_sourcing, regulatory_feasibility: not candidates.
-- Spec 04 section 7 lists "Grid carbon intensity" as its own dataset family (Ember, EEA, eGRID, NESO), separate from
-- Energy (prices) and Infrastructure. None of the six definitions covers it, so one value is added: `grid_intensity`.
--
-- WHY TWO CHECKS. migration 109's trigger region_dimension_coverage_sync_fact_count() (rdf_sync_coverage) runs AFTER every
-- INSERT/UPDATE/DELETE on regional_data_facts and upserts region_dimension_coverage (region_id, dimension). That table
-- carries its own dimension CHECK "mirroring migration 106". Widening only regional_data_facts would make the FIRST
-- grid_intensity fact fail inside the trigger with check_violation and roll the fact back. Both are widened together.
-- No coverage seed row is inserted (109 seeded 5 regions x 6 dimensions as 'missing'): the trigger creates the
-- (region, grid_intensity) cell on the first fact and flips it to 'populated', and a seed for regions that will never
-- carry this dimension would add 'missing' cells to the coverage view that no producer is going to fill.
--
-- THE data_sources ROW (the FK). regional_data_facts.source_key REFERENCES data_sources(source_key) (migration 267), so
-- the producer cannot write a fact until the source is registered. The register entry is in the same PR
-- (src/lib/contracts/source-licence.mjs, key neso_carbon_intensity) and this row carries the SAME values (a test in
-- 378_grid_intensity_dimension.test.mjs renders the register row and finds it in this file). The insert is ON CONFLICT
-- DO NOTHING, never DO UPDATE, the migration 281 pattern: a later register regeneration of 258's block is a separate act.
-- LICENCE BASIS: the PROD-SRC fact lane (2026-10-08) read the NESO Carbon Intensity API page and recorded `CC BY 4.0`
-- plus an "API Terms of Use" pointer on GitHub (register section 1.5, row D); verified_on carries that date. The Terms of
-- Use were not read by that lane or by this one. 'permitted' follows the CC BY precedent in the register (eurostat,
-- ec_weekly_oil_bulletin): attribution is an authorisation, not a condition to discharge, and the attribution string
-- ships with the data.
--
-- TIER. The source's rating is NOT stored in data_sources (it has no tier column). The producer registers the publisher
-- in `sources` through registerSource with the tier from the institution class table plus the committed host verdict batch (host-verdicts-001.json classes the host gov, tier 2), and stamps each
-- fact's source_id with that row (regional_data_facts.source_id, migration 106), so the fact carries the rating (rule 18).
--
-- Reversible: `DELETE FROM public.data_sources WHERE source_key = 'neso_carbon_intensity';` (safe while no fact
-- references it), and re-run the two ADD CONSTRAINT statements with the six original values (only valid while no
-- grid_intensity row exists). DDL: two DROP/ADD CONSTRAINT pairs; existing rows (six values only) satisfy the new lists.

BEGIN;

ALTER TABLE regional_data_facts
  DROP CONSTRAINT IF EXISTS regional_data_facts_dimension_check;
ALTER TABLE regional_data_facts
  ADD CONSTRAINT regional_data_facts_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost',
    'grid_intensity'
  ));

ALTER TABLE region_dimension_coverage
  DROP CONSTRAINT IF EXISTS region_dimension_coverage_dimension_check;
ALTER TABLE region_dimension_coverage
  ADD CONSTRAINT region_dimension_coverage_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost',
    'grid_intensity'
  ));

COMMENT ON COLUMN regional_data_facts.dimension IS
  'One of 7 Operations dimensions. D1 regulatory_feasibility is rendered via Regulations cross-refs (no rows here); D2-D6 store actual facts; grid_intensity (migration 378) stores grid carbon intensity in gCO2/kWh per region, from a public grid operator or statistics body.';

INSERT INTO public.data_sources
  (source_key, name, redistribution, embeddable, licence, attribution, url, verified_on, blocker, ask_who, ask_what, substitute)
VALUES (
  'neso_carbon_intensity',
  'National Energy System Operator (NESO), Carbon Intensity API',
  'permitted',
  true,
  'CC BY 4.0',
  'Source: National Energy System Operator (NESO), Carbon Intensity API, CC BY 4.0',
  'https://carbonintensity.org.uk/',
  '2026-10-08'::date,
  NULL,
  NULL,
  NULL,
  NULL
)
ON CONFLICT (source_key) DO NOTHING;

-- ── Post-checks and self-check ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  def text;
  d   text;
  r   public.data_sources%ROWTYPE;
  v_region uuid;
  v_count  integer;
  n_facts  integer;
  n_cells  integer;
BEGIN
  -- Both CHECKs now carry all seven values.
  FOR def IN
    SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
     WHERE c.conname IN ('regional_data_facts_dimension_check', 'region_dimension_coverage_dimension_check')
  LOOP
    FOREACH d IN ARRAY ARRAY['regulatory_feasibility', 'regional_resources', 'labor_markets', 'materials_sourcing', 'infrastructure', 'operational_cost', 'grid_intensity'] LOOP
      IF position(d IN def) = 0 THEN
        RAISE EXCEPTION 'ABORT: a dimension CHECK lacks %: %', d, def;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('regional_data_facts_dimension_check', 'region_dimension_coverage_dimension_check')) <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected exactly the two dimension CHECK constraints';
  END IF;

  -- The FK target exists and is licence-clear.
  SELECT * INTO r FROM public.data_sources WHERE source_key = 'neso_carbon_intensity';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: data_sources has no neso_carbon_intensity row after this migration''s insert';
  END IF;
  IF r.redistribution <> 'permitted' OR r.embeddable IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: neso_carbon_intensity is not permitted/embeddable (redistribution=%, embeddable=%)', r.redistribution, r.embeddable;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licence_clear_sources WHERE source_key = 'neso_carbon_intensity') THEN
    RAISE EXCEPTION 'ABORT: neso_carbon_intensity does not appear in licence_clear_sources';
  END IF;

  SELECT id INTO v_region FROM public.regions WHERE code = 'UK';
  IF v_region IS NULL THEN
    RAISE EXCEPTION 'ABORT: regions has no UK row, the region the NESO producer writes to';
  END IF;

  -- ATTACK, rolled back by a sentinel. (a) a grid_intensity fact is accepted and the 109 trigger records its cell;
  -- (b) a bogus dimension is refused by regional_data_facts; (c) a bogus dimension is refused by region_dimension_coverage.
  BEGIN
    INSERT INTO public.regional_data_facts (region_id, dimension, fact_label, value)
    VALUES (v_region, 'grid_intensity', 'migration 378 self-check', '1 gCO2/kWh');

    SELECT fact_count INTO v_count FROM public.region_dimension_coverage
     WHERE region_id = v_region AND dimension = 'grid_intensity';
    IF v_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'ABORT: the coverage trigger did not record the new dimension (fact_count=%)', v_count;
    END IF;

    BEGIN
      INSERT INTO public.regional_data_facts (region_id, dimension, fact_label, value)
      VALUES (v_region, 'not_a_dimension', 'migration 378 self-check bogus', '1 x');
      RAISE EXCEPTION 'ABORT: regional_data_facts accepted a dimension outside the vocabulary';
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.region_dimension_coverage (region_id, dimension)
      VALUES (v_region, 'not_a_dimension');
      RAISE EXCEPTION 'ABORT: region_dimension_coverage accepted a dimension outside the vocabulary';
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;

    RAISE EXCEPTION 's8e5_378_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 's8e5_378_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_facts FROM public.regional_data_facts WHERE fact_label LIKE 'migration 378 self-check%';
  IF n_facts <> 0 THEN
    RAISE EXCEPTION 'ABORT: the self-check left % fact row(s) behind', n_facts;
  END IF;
  SELECT count(*) INTO n_cells FROM public.region_dimension_coverage WHERE dimension IN ('grid_intensity', 'not_a_dimension');
  IF n_cells <> 0 THEN
    RAISE EXCEPTION 'ABORT: the self-check left a coverage cell behind';
  END IF;

  RAISE NOTICE 'migration 378 OK: grid_intensity is a dimension on regional_data_facts and region_dimension_coverage, neso_carbon_intensity is registered (permitted, embeddable), the 109 trigger records the new cell, bogus dimensions are refused by both tables, nothing left behind';
END $$;

COMMIT;
