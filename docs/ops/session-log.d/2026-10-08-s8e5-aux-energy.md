# 2026-10-08 lane S8-E5 (s8e5-aux-energy): NESO grid carbon intensity as a regional fact

## Accomplished

- First stop, then ruling. The brief named `auxiliary_energy_profiles`; reading migrations 297, 311, 349 showed it is one row per
  stationary load with NOT NULL `load_type`, `kw_draw`, `duty_cycle`, `hours_typical` and `org_id`, no value or envelope column,
  and `grid_intensity_source` is a text that only names a source. The lane stopped; the coordinator ruled A: the figure is a
  `regional_data_facts` fact, `auxiliary_energy_profiles` stays as it is (scripts/spec09/SOURCES.md already said so).
- Producer `fsi-app/scripts/producers/regional/neso-carbon-intensity-producer.mjs`: dry by default, `ENABLED=false`, kill switch
  `REGIONAL_PRODUCER_NESO_CARBON_INTENSITY_ENABLED`, `--input <file>` for fixture runs. 14 daily blocks parse to 14 observations,
  reduce to ONE current-state row (region UK, dimension `grid_intensity`, newest period). Envelope: value_numeric = the API's
  `average`, unit `gCO2/kWh`, derivation observed, origin_class official, source_key `neso_carbon_intensity`, as_at_date = the
  API period end, reference_period = the period start day, method_version `neso-carbon-intensity-stats-parser@1`.
  Not carried and never estimated: n_observations, currency, status, trend, and the API's max, min and index.
- Source rating: the publisher is registered through `registerSource` at the tier `classTierForHost` computes
  (`rateSourceByInstitutionClass`, shared with state-cost and the carrier producers). The fact row carries the registered
  `sources.id` in `source_id`. Measured: `classTierForHost("carbonintensity.org.uk", "National Energy System Operator (NESO)
  Carbon Intensity API")` returns 7 (the residue ruling's company class). The `neso.energy` host also returns 7. Recorded, not
  adjusted: a tier for a grid operator that is a public body is the class table's decision.
- Refusals: apply is refused unless ENABLED, the kill switch and DB creds hold; when the `data_sources` row is absent the
  error is "data_sources has no row for source_key neso_carbon_intensity: apply migration 378 first ..." and nothing is registered
  or written first; when the UK region row is absent, "region code UK not found in regions".
- Migration 378 (NOT APPLIED): adds `grid_intensity` to BOTH dimension CHECKs (`regional_data_facts_dimension_check`, 106, and
  `region_dimension_coverage_dimension_check`, 109, because the 109 trigger upserts the coverage table for every fact), and
  inserts `data_sources.neso_carbon_intensity` (the FK target; ON CONFLICT DO NOTHING; the migration 281 model). Self-check in a
  rolled-back sub-transaction: accepts a grid_intensity fact, the 109 trigger records its cell, a bogus dimension is refused by
  each table, nothing survives.
- Registry entry `scripts/producers/registry/neso-carbon-intensity.json` (`in_all: false`, see Decisions).
- Fixture `fixtures/neso-carbon-intensity-sample.json` (2690 bytes, real response, fetched once 2026-10-08, HTTP 200, no key)
  with `neso-carbon-intensity-sample.header.md` (fetch URL, date, licence text as recorded by PROD-SRC).
- `docs/inventories/shared-dataset-ownership.md`: prose bullet under `regional_data_facts`. `docs/inventories/migrations.md`
  regenerated; `APPLIED-MAP.json` carries `never:378_grid_intensity_dimension.sql` (via `--add-never --write`).

## Read and reused

- Read: CLAUDE.md, lane-common-contract.md, COMMON.md, producers-e.md, the PROD-SRC register, spec 09 section 1.5, spec 04
  section 7, migrations 106, 109, 258, 267, 281, 284, 297, 311, 349, 352, 372, ADR-042, SOURCES.md, load-registry.mjs,
  run-registered.mjs, ecb-fx.json and producer, eurostat-nrg-pc-205 producer and parser, run-envelope-producer.mjs,
  regional-facts-envelope.mjs, state-cost-facts-producer.mjs header, rate-source-by-class.mjs, host-authority.ts
  (`classTierForHost`), institution.ts, db.mjs (`registerSource`, guarded writers), F27 and the shared-writer registry test.
- Reused instead of built: `toCandidateRows` and `latestPerNaturalKey` (run-envelope-producer), `planUpsert` and
  `buildEnvelopeRow` (regional-facts-envelope), `makeResolveSource` (rate-source-by-class), `registerSource`, the guarded
  writers, `writeProducerSummary`, `isMainModule`, `loadLocalEnvFile`/`withoutCredentials`, the registry loader, migration 281's
  data_sources insert pattern, `supabase/migrations/_lib/fixture-inserts.mjs` for the 378 fixture check.

## Decisions

- DAILY, not half-hourly: the API publishes the 24 hour block directly, so the value is the source's own number (observed).
- ONE ROW, not one row per day: `regional_data_facts` is current-state (UNIQUE region, dimension, fact_label) and the sibling
  producers reduce the same way. The coordinator's "one fact per period" is honoured at the observation level (14 parsed, each
  period's number is validated and enveloped); the table keeps the newest.
- UNIT `gCO2/kWh`, not the `gCO2e/kWh` in the ruling text: spec 04 section 7 and the API use gCO2/kWh; the response has no unit field.
- A new dimension value, not a reused one: `regional_resources` is defined as materials, recyclables, qualified suppliers;
  `operational_cost` is prices; `infrastructure` is capacity. None covers an emissions factor.
- `ENABLED=false` and `in_all: false`: a registry sweep in apply mode stops on the first non-zero child (SBTi precedent), and
  no population happens until every build layer is complete.
- Own guarded write loop instead of `runEnvelopeProducer`: the shared shell builds rows without `source_id`, and rule 18 wants the
  rated source on the figure. The pure pieces are reused; the loop is the only new code.
- `data_sources` row inserted in migration 378 (migration 281's model), because the sanctioned flow edits
  `src/lib/contracts/source-licence.mjs`, outside this write set. The known consequence 281 recorded applies: the register file
  lacks the key until a follow-up adds it.

## NOT done

- Nothing applied; no live row; no scrape or population.
- `scripts/producers/registry/load-registry.test.mjs` hard-codes the exact registry list (four names, `in_all` filter); it fails
  with a fifth entry. It is outside the write set: NEEDS WRITE-SET EXPANSION (reported to the coordinator, not touched). It will
  fail the same way for S8-E6 and S8-E1, whichever merges second also conflicts on that line.
- Consumers of the seventh dimension are not wired (not in the grant): `OperationsDimension` / `ALL_OPERATIONS_DIMENSIONS` in
  `src/lib/agent/formats/operations-matrix.ts`, `DIMENSIONS` in `OperationsLedger.tsx`, `RegionDimensionMatrix`, and the
  composition tests that pin six values for their own producers. The live-schema inventory
  `docs/inventories/db-check-constraints.json` (source: live) updates when 378 is applied and re-run.
- `SOURCE_LICENCES` in source-licence.mjs lacks `neso_carbon_intensity` (see Decisions).
- `verified_on` is NULL on the data_sources row: the licence page was read by PROD-SRC, not re-read here.
- The stats response does not say whether `average` is over forecast or actual half-hours; not determined.

## Open items

- Tier 7 for NESO is what the class table computes; a host verdict batch (scripts/maintenance/host-verdicts) could place the
  host in the gov class (tier 2). That is the coordinator's call, not made here.
- `entity_id`: not needed for this producer (ruling). L4-E's `entity_id` registry field is not on master and is not used.
