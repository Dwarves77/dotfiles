# 2026-10-08 lane S8-E5 (s8e5-aux-energy): NESO grid carbon intensity as a regional fact

## Accomplished

- First stop, then ruling. The brief named `auxiliary_energy_profiles`; reading migrations 297, 311, 349 showed it is one row per
  stationary load with NOT NULL `load_type`, `kw_draw`, `duty_cycle`, `hours_typical` and `org_id`, no value or envelope column,
  and `grid_intensity_source` is a text that only names a source. The lane stopped; the coordinator ruled A: the figure is a
  `regional_data_facts` fact, `auxiliary_energy_profiles` stays as it is (scripts/spec09/SOURCES.md already said so).
- Producer `fsi-app/scripts/producers/regional/neso-carbon-intensity-producer.mjs`: dry by default, `ENABLED=false`, kill switch
  `REGIONAL_PRODUCER_NESO_CARBON_INTENSITY_ENABLED`, `--input <file>` for fixture runs. 14 daily blocks parse to 14 observations,
  reduce to ONE current-state row (region UK, dimension `grid_intensity`, newest period). Envelope: value_numeric = the API's
  `average`, unit `gCO2/kWh`, derivation observed, origin_class official, source_key `neso_carbon_intensity`, as_at_date = the API
  period end, reference_period = the period start day, method_version `neso-carbon-intensity-stats-parser@1`.
  Not carried and never estimated: n_observations, currency, status, trend, and the API's max, min and index.
- Refusals: apply is refused unless ENABLED, the kill switch and DB creds hold; when the `data_sources` row is absent the
  error is "data_sources has no row for source_key neso_carbon_intensity: apply migration 378 first ..." and nothing is registered
  or written first; when the UK region row is absent, "region code UK not found in regions".
- Migration 378 (NOT APPLIED): adds `grid_intensity` to BOTH dimension CHECKs (`regional_data_facts_dimension_check`, 106, and
  `region_dimension_coverage_dimension_check`, 109, because the 109 trigger upserts the coverage table for every fact), and
  inserts `data_sources.neso_carbon_intensity` (the FK target; ON CONFLICT DO NOTHING; the migration 281 model; values identical
  to the new register entry, pinned by a test). Self-check in a rolled-back sub-transaction: accepts a grid_intensity fact, the
  109 trigger records its cell, a bogus dimension is refused by each table, nothing survives.
- Registry entry `scripts/producers/registry/neso-carbon-intensity.json` (`in_all: false`, see Decisions).
- Fixture `fixtures/neso-carbon-intensity-sample.json` (2690 bytes, real response, fetched once 2026-10-08, HTTP 200, no key)
  with `neso-carbon-intensity-sample.header.md` (fetch URL, date, licence text as recorded by PROD-SRC, the NESO About page URL).
- Grant 1 (load-registry.test.mjs): the exact-list assertion is now the superset form (the four originals present, entries sorted,
  sbti in the in_all-false set), so S8-E6 and S8-E1 do not collide on that line.
- Grant 3 (source-licence.mjs): `neso_carbon_intensity` register entry, `permitted`, licence `CC BY 4.0`, attribution string, the
  PROD-SRC reading quoted (page states "CC BY 4.0", "API Terms of Use" pointer), `verifiedOn 2026-10-08`.
- Grant 4 (tier): `scripts/maintenance/host-verdicts/host-verdicts-001.json`, one entry, host `carbonintensity.org.uk`, class
  `gov`, evidence: NESO is publicly owned (the UK government completed the purchase of the Electricity System Operator on
  2024-10-01), citation the NESO About page https://www.neso.energy/about (not fetched by the lane; the claim is the
  coordinator's). The tier is never typed: it is read from the class table for the verdict's class (gov = tier 2,
  `HOST_CLASS_TIER`). The batch is dry as every batch is. Until the batch is on master the class table's answer for this
  publisher is tier 7 (the residue ruling's company class); once it is, the producer rates tier 2 through the shared rating
  step, with no special case of its own.
- Resolver fix (shared, granted): `classTierForHostWithVerdicts` in `src/lib/sources/host-authority.ts` is now the one
  precedence: never-register hosts, then the curated host-only rules, then a committed verdict, then the residue ruling over
  the stored name. `scripts/lib/rate-source-by-class.mjs` rates through it (committed batches by default, `hostVerdicts`
  injectable, forwarded by `makeResolveSource`). The producer's own verdict-first special case is removed. Red-then-green in
  `scripts/lib/rate-source-by-class.test.mjs`: 3 of 10 failed before the fix, 10 of 10 after, including the six-name probe.
- Rail fix (granted): the shared facet "+ N more" button carries `minHeight: 44` inline, like the rows
  (`ListSurfaceRailCards.tsx`); red-then-green in `ListSurfaceRailCards.facets.npmtest.mjs` (1 of 8 failed, then 8 of 8).
  This closes the 11 rendering-guard findings D7 caused (a seventh Dimension option hid behind a 24 px "+ 1 more" button).
- Grant 2 (readers): `grid_intensity` is wired as D7 in the one constant the Operations surface renders its dimensions from,
  `DIMENSIONS` in `OperationsLedger.tsx` (`MATRIX_DIMENSIONS` is that constant; the matrix rows, the rail Dimension facet, the
  coverage-gap counts and the statements all read it, and `RegionDimensionMatrix` takes the list as a prop), and in
  `operations-matrix.ts` (`OperationsDimension`, `ALL_OPERATIONS_DIMENSIONS`, `DIMENSION_LABELS`). The masthead no longer types
  "six dimensions per region": it derives the count word from the constant. `OperationsLedger.npmtest.mjs` now pins seven.
  `RegionDimensionMatrix.tsx` is unchanged: it holds no dimension list (read in full), and its header comment still says six.
- `docs/inventories/shared-dataset-ownership.md`: prose bullet under `regional_data_facts`. `docs/inventories/migrations.md`
  regenerated; `APPLIED-MAP.json` carries `never:378_grid_intensity_dimension.sql` (via `--add-never --write`).

## Read and reused

- Read: CLAUDE.md, lane-common-contract.md, COMMON.md, producers-e.md, the PROD-SRC register (sections 0 and 1.5), spec 09
  section 1.5, spec 04 section 7, migrations 106, 109, 258, 267, 281, 284, 297, 311, 349, 352, 372, ADR-042, SOURCES.md,
  load-registry.mjs, run-registered.mjs, ecb-fx.json and producer, eurostat-nrg-pc-205 producer and parser,
  run-envelope-producer.mjs, regional-facts-envelope.mjs, state-cost-facts-producer.mjs header, rate-source-by-class.mjs,
  host-authority.ts (`classTierForHost`, `classTierForHostWithVerdicts`, `verdictPlacementForHost`, `HOST_CLASS_TIER`),
  institution.ts, db.mjs (`registerSource`, guarded writers), F27 and the shared-writer registry test, source-licence.mjs and
  its test, scripts/drain/kinds.mjs, the host-verdicts README, schema.json, loader and fixture, resolve-provisional-sources.mjs
  (rule b2), OperationsLedger.tsx and its npmtest, RegionDimensionMatrix.tsx (header and props), region-grid.mjs,
  operations-matrix.ts, ux-laws.md, design-principles.md (DP-1, DP-2).
- Reused instead of built: `toCandidateRows` and `latestPerNaturalKey` (run-envelope-producer), `planUpsert` and
  `buildEnvelopeRow` (regional-facts-envelope), `registerSource`, the guarded writers, `writeProducerSummary`, `isMainModule`,
  `loadLocalEnvFile`/`withoutCredentials`, the registry loader, migration 281's data_sources insert pattern,
  `supabase/migrations/_lib/fixture-inserts.mjs`, the host-verdicts loader and batch shape, `renderDataSourceSeedSql` for the
  register parity test, the existing DIMENSIONS constant for the readers.

## Decisions

- DAILY, not half-hourly: the API publishes the 24 hour block directly, so the value is the source's own number (observed).
- ONE ROW, not one row per day (accepted by the coordinator): `regional_data_facts` is current-state (UNIQUE region, dimension,
  fact_label) and the sibling producers reduce the same way.
- UNIT `gCO2/kWh` (accepted): spec 04 section 7 and the API use it; the response has no unit field.
- A new dimension value, not a reused one: `regional_resources` is materials, recyclables, qualified suppliers;
  `operational_cost` is prices; `infrastructure` is capacity. None covers an emissions factor.
- `ENABLED=false` and `in_all: false`: a registry sweep in apply mode stops on the first non-zero child (SBTi precedent), and
  no population happens until every build layer is complete.
- Own guarded write loop instead of `runEnvelopeProducer`: the shared shell builds rows without `source_id` (rule 18 wants the
  rated source on the figure). The pure pieces are reused; the loop is the only new code. Rating is the shared step, not a copy.

## Findings

- [CONFIRMED, six-name probe, 2026-10-08, `classifyResidueRuling("carbonintensity.org.uk", name)`] A host verdict was
  unreachable for any host that carries a stored name. The resolvers ran the built-in rules, including the D14 residue
  ruling's rule 7 (company, tier 7), BEFORE consulting a verdict, and rule 7 places every host given a non-empty name. Probe
  results: name null returns the worklist (tier null); "NESO", "Carbon Intensity API", "National Energy System Operator",
  "National Energy System Operator (NESO) Carbon Intensity API" and "Carbon Intensity" each return company, tier 7. FIXED in the
  shared function and the shared rating step (above), and then in the two callers that kept their own two-step order
  (class tier across names first, verdict only when that was null): `resolve-provisional-sources.mjs` (`resolveSignals`,
  rule b2) and `enumerate-unclassified-hosts.mjs` (`collectUnresolvedRows`). Both now place a host through
  `placeHostWithVerdicts` / `classTierForHostWithVerdicts` in `host-authority.ts`, the one precedence (never-register hosts,
  curated host-only rules, verdict, residue ruling over the names); `classTierForHostWithVerdicts` is the tier of
  `placeHostWithVerdicts`, which also reports which layer answered so the resolver can keep labelling rule b versus b2.
  Neither caller keeps an ordering of its own (a structural test in each file's test fails if a private verdict lookup returns).
  Red-then-green: 3 tests failed before (the six-name probe on the resolver and on the enumerate step, and the structural
  test), 65 of 65 after; the wider maintenance, research and turns suites pass (1753 tests).
- [CONFIRMED] `registerSource` dedups by institution key and does not update the tier of an existing row, so if a tier 7 `sources`
  row for `carbonintensity.org.uk` already exists in production, the producer's first apply reuses it at tier 7. Read-only SQL
  before the first apply: `select id, base_tier from sources where url like '%carbonintensity.org.uk%'`.

## UX compliance (OperationsLedger, RegionDimensionMatrix, rail Dimension facet; D7 row)

- Primary goal: read what a region's operating environment is on each dimension, now including how carbon-intensive the grid
  is, and compare regions on it. Path: open /operations; the matrix shows seven dimension rows by region columns; one click on a
  cell opens its facts in the existing fixed-height panel; the rail Dimension facet narrows the matrix to one row (D7 included).
  Primary action: select a cell (unchanged). No new control, no new component: D7 is one more row from the same constant, so
  every interaction (click, arrow keys, Esc, compare mode on the row header, the facet) is the existing one (laws 3, 12, 16).
- Async actions: none added. The existing states are unchanged: the linked-regulations figure shows its counting state until the
  remainder fetch resolves, an empty cell renders the shared Absence convention (no GB grid fact yet means a D7 cell reads as
  absent, never a blank and never an invented number), the panel is a fixed-height slot so the card never changes height.
- Targets and widths: the new row uses the same row anatomy as D1 to D6, so the 44 px floor and the sticky first column are the
  existing ones; the dimension name "D7 Grid carbon intensity" is longer than the others, so it is the row to check at 375 px.
  Measured at 375 and 1280 by the rendering guard: see the result lines under Verification in the PR body.
- DESIGN CHANGES OWED (rule 20, for Claude Design): artboard 08 draws six dimension rows and the scope line "six dimensions per
  region"; the build now has seven (D7 Grid carbon intensity) and the scope line follows the constant. Artboard 08 needs a
  seventh matrix row and rail facet entry, and a count that reads from the list.

## NOT done

- Nothing applied; no live row; no scrape or population. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- `OperationsDimension` consumers beyond the three granted files were not audited for a six-value assumption outside
  `src/components/operations` and `operations-matrix.ts`; the grep over `src` for the six names found no other list.
- `docs/inventories/db-check-constraints.json` (source: live) updates when 378 is applied and the inventory re-run.
- The NESO About page and the API Terms of Use were not fetched by this lane; the ownership claim (the UK government completed the purchase of the Electricity System Operator on 2024-10-01) is the coordinator's ruling. [NOT-WORK: fact, no action]
- The stats response does not say whether `average` is over forecast or actual half-hours; not determined.

## Open items

- `host-verdicts-001.json`: batch numbers are per directory and S8-E6 or S8-E1 could also add one; whichever merges second
  renumbers. [NOT-WORK: fact, no action]
- `entity_id`: not needed for this producer (ruling). L4-E's `entity_id` registry field is not on master and is not used. [NOT-WORK: fact, no action]
