# 2026-10-08 lane S8-E1 (s8e1-oem-roadmap): a registered producer for oem_tech_roadmaps from the EEA heavy-duty vehicle CO2 extract

Domain 1.1 of spec 09. Fixtures only, nothing applied, no database. Branch lane/s8e1-oem-roadmap. The coordinator's rulings of 2026-10-08 are applied (see "Rulings applied").

## Dataset (every item below is [CONFIRMED] by the fetch session of 2026-10-08, header in fixtures/eea-hdv-sample.header.json)

- EEA "CO2 emissions from heavy-duty vehicles", vehicle extract `HDV_CO2Emission_VehicleExtract_24042025.csv`, vehicle level, 461 columns, UTF-8 with a byte order mark, CRLF, quoted fields. Full file 4,029,364,100 bytes, `Last-Modified: Mon, 28 Apr 2025 10:29:17 GMT`, `Accept-Ranges: bytes`. Dataset page: Published 29 Apr 2025, temporal coverage 2019-2023.
- Licence text on the EEA catalogue record, quoted: "License CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright holder: Directorate-General for Climate Action (DG-CLIMA), European Environment Agency (EEA)." The licence register key `eea` (src/lib/contracts/source-licence.mjs) already says redistribution permitted, CC BY 4.0.
- Fixture: first 71 complete records, 187,542 bytes, byte for byte. All 71 are one manufacturer (DAF Trucks N.V.), zero-emission flag "No", engine fuel "Diesel CI". It proves the parser and the aggregation; it contains no zero-emission vehicle.

## Accomplished

- `fsi-app/scripts/producers/oem/eea-hdv-csv.mjs`: streaming RFC 4180 reader (chunk-boundary independent, BOM, CRLF, quoted newlines) and an aggregator that folds the extract into groups by manufacturer and powertrain columns, with vehicles per registration year; `maxBytes` read with the half record dropped and the result marked truncated.
- `eea-hdv-map.mjs` + `eea-hdv-classification.json`: groups to the 13 insertable columns of oem_tech_roadmaps; strict config validation (closed category and stage sets).
- `eea-hdv-co2-producer.mjs`: fetch adapter (injected fetch, Range header for a dry sample), four apply gates (ENABLED constant shipped false, `OEM_PRODUCER_EEA_HDV_ENABLED`, DB credentials, complete read), source gate, idempotent plan keyed (manufacturer, technology, source), guarded writes with cite, producers-family summary on every path (edges_authored null: this table carries no derivation edges).
- `fsi-app/scripts/producers/registry/eea-hdv-co2.json` (`in_all: false`: one read streams 4 GB, so it runs when named, never in the producer=all sweep).
- Migration 380, NOT APPLIED: outbox trigger on oem_tech_roadmaps in 352's form `('roadmap_id','manufacturer_id')`, and `announced_at` made nullable. Static test with the shared fixture-INSERT checker; regenerated `docs/inventories/migrations.md`; `build-applied-map.mjs --add-never --write` added `never:380_...`.
- `load-registry.test.mjs`: the exact-equality pin on the four original entries became a superset check (granted by the coordinator).
- `src/lib/learning/questions-on-change.mjs`: one map entry for oem_tech_roadmaps (granted).

## Columns

- Covered: manufacturer_id (existing organisation entity only, never minted), tech_category, commercial_stage, source_id, origin_class `official`, derivation `calculated` (the stage is a classification computed from observed registration counts; ruling 3).
- Left NULL, never estimated: target_year, energy_density_wh_kg, density_basis, c_rate_max, usable_kwh, announced_at (the extract holds none of them).
- confidence_admiralty: NULL. The PROD-SRC register carries no confidence note for this dataset; spec 09's "typically B2/C2" describes vendor claims, which a registration count is not.
- The table has no unit or as_of column; the dataset date (Last-Modified, 2025-04-28) is recorded in the guarded write's cite and the run summary.

## Source and tier

Publisher host eea.europa.eu. `classTierForHost("eea.europa.eu", name)` returns 2 [CONFIRMED by running it]; the host is known to the institution class table (GOV_INTERGOV), so no host-verdict batch is needed. The producer rates and registers through `rateSourceByInstitutionClass` (registerSource, idempotent by host; seed-sources.sql already holds https://www.eea.europa.eu) and then reads the row back: an absent row is a refusal, "REFUSING: the source row <id> is absent from sources after registration, so no row can cite it".

## Dry-run output (real CLI, fixture, no database)

```
eea-hdv-co2: 71 vehicle(s) counted of 71 record(s), 1 group(s) (DRY RUN)
eea-hdv-co2: source preview:eea.europa.eu at tier 2
eea-hdv-co2: rows planned 0, created 0, updated 0, unchanged 0, written 0
eea-hdv-co2: residue conventional_powertrain: 1 group(s), 71 vehicle(s)
eea-hdv-co2: DRY RUN, nothing written.
```
`--apply` on the same input exits 1: "REFUSING: the source-level ENABLED constant ... is false".

## Rulings applied (coordinator, 2026-10-08)

1. Granted: one `EMITTING_TABLE_EVENT_MAP` entry for `oem_tech_roadmaps` (`value_revised`); `questions-on-change.test.mjs` goes from 1 failing to 19 of 19.
2. Granted: one fetch of the EEA HDV table definition, read as text by a script that parsed the sheet XML (no image; the downloaded file and the extracted XML were deleted afterwards). Result [CONFIRMED]: the sheet "Attribute table", "Extract from SQL database: 2024-03-22", holds field names and datatypes only: OEM_ZeroEmissionVehicle bit, OEM_HybridElectricHDV bit, OEM_DualFuelVehicle bit, OEM_Engine_FuelType nvarchar(20), MS_FuelType nvarchar(20), MS_Electric nvarchar(10), Match nvarchar(8), UniqueData nvarchar(4), OEM_ManufacturerName nvarchar(120). It carries NO list of values, so it does not evidence which fuel value marks a battery-electric or a fuel-cell vehicle, and no string mentioning hydrogen, fuel cell or battery occurs in it. `zev_tech_rules` therefore stays empty (quoted in the config's header); a rule is written when a real run's residue shows the values. Until then every zero-emission group is residue `zero_emission_unmapped` and the producer writes no row.
3. Stage thresholds, as data in `eea-hdv-classification.json` (its header cites the ruling): per manufacturer x tech_category x registration year, 1 to 999 registered vehicles is small_batch_fleet, 1000 or more mass_series_production; announced and pilot_demonstration are never written. The row carries derivation `calculated`. My reading of the table's shape, for the coordinator to veto: the table has no year column, so the row is the current state and the year used is the latest registration year with registrations for that manufacturer and technology (summed over that technology's powertrain groups); units with no parseable registration date give no stage evidence (residue `no_registration_year`).
4. Manufacturer aliases left empty (population time, through the alias table of migration 377).
5. The empty-state text of the panel is unchanged.

## What is NOT evidenced, stated

The shipped run writes 0 rows on real data today: no zero-emission fuel value is in evidence (ruling 2 result). The zero-emission classification and the manufacturer aliases are built and tested with a SYNTHETIC config; their data lands later. The stage rule is real and tested.

## Read and reused

Read in full: CLAUDE.md, lane-common-contract, COMMON and the producers-e brief, the PROD-SRC register (section 0 and 1.1), spec 09, the S8-E0 session log, migrations 296 and 352 (and 311, 373 by diff), `load-registry.mjs`, `run-registered.mjs` and their tests, `producers-workflow.test.mjs`, `producer-summary-wiring.test.mjs`, `producer-summary.mjs`, `ecb-fx-producer.mjs`, `scripts/spec09/oem-roadmap-producer.mjs`, `scripts/spec09/lib/rows-file.mjs`, `scripts/spec09/SOURCES.md`, `rate-source-by-class.mjs`, `db.mjs` registerSource, `OemRoadmapPanel.tsx` and its View, `oem-payload.mjs`, `questions-on-change.mjs` and its test, `_lib/fixture-inserts.mjs`, the L4-E diff and log.
Reused instead of built: `rateSourceByInstitutionClass` and `registerSource` (rating and registration), `resolveEntityByName` (rows-file.mjs), `writeProducerSummary`, `isMainModule`, `loadLocalEnvFile`, the registry loader and runner unchanged, 352's trigger form, the shared fixture-INSERT checker, the S8-E0 registry directory. Nothing in the repo parsed this dataset or a streaming CSV with quoted newlines.

## Red then green

Each new test file was run before its module existed: `ERR_MODULE_NOT_FOUND` for `eea-hdv-csv.mjs`, `eea-hdv-map.mjs` and `eea-hdv-co2-producer.mjs`; then they passed. The registry pin: `load-registry.test.mjs` failed against the new entry and passes after the granted superset change. `questions-on-change.test.mjs` failed with 380 in the tree ("emitting table(s) with no event mapping: oem_tech_roadmaps") and passes with the map entry. Migration 380: a mutation (trigger reduced to one argument, DROP NOT NULL turned into SET NOT NULL) turned two tests red. After the stage ruling the csv, map and producer tests were edited first (2, 5 and 3 failures against the old code), then the code made them pass.

## Confirmed facts for follow-up lanes

- oem_tech_roadmaps HAS a reader: `src/components/market/OemRoadmapPanel.tsx` (server component, selects roadmap_id, tech_category, commercial_stage, target_year, density_basis, confidence_admiralty, announced_at) and `OemRoadmapPanelView.tsx`. Neither enumerates tech_category or commercial_stage from a constant (`git grep` for the eight category names, the four stage names and for TECH_CATEGOR / COMMERCIAL_STAGE under src found nothing), so nothing new needs wiring. `OemRoadmapRow.announced_at` is typed `string` and never rendered, so a NULL changes no output. The empty-state line ("source: none confirmed ...") stays by ruling.
- A second writer of the table exists, `scripts/spec09/oem-roadmap-producer.mjs` (reviewed rows file, via maintenance.yml). It cites a per-row source; this producer cites the EEA source and never matches or updates rows of another source.
- `entity_id` on the registry entry (L4-E's field) was NOT added: that PR (#1026) is unmerged so the loader on master refuses the field, and it would be inert here (it only feeds `PRODUCER_ENTITY_ID` to the market_series write path; this table's entity is the manufacturer, resolved by the trigger's second argument).

## Disclosed deviation

The brief permits one network fetch (the fixture sample). The URL was not named in the brief, so finding it took the EEA register URL (redirected to the datahub page), two more reads of that page, then the CSV request itself (190,000 bytes read, connection closed). One WebFetch to a guessed URL returned 404 and was a mistake. A later grant (ruling 2) covered the table-definition file, one further GET to sdi.eea.europa.eu. No other host was contacted.

## NOT done

Nothing applied or run against live data; ENABLED stays false. The zero-emission rules and the aliases are empty (above); no battery-electric versus fuel-cell split exists until the values are evidenced.

## CI round 1: F27 (producer-seam-proof)

CI failed one fitness function, F27: "NO COMPOSITION PROOF ... imports 3 first-party seam(s) and no single proof file imports all of them together" (producer-summary.mjs, eea-hdv-csv.mjs, eea-hdv-map.mjs). Reproduced locally with `runner.mjs --function=F27` (FAIL, 1 violation). Fix, approved by the coordinator: one real-chain composition test in `eea-hdv-co2-producer.test.mjs` (real reader and aggregator, real mapper, `runProducer` with the real `writeProducerSummary` into a temp `PRODUCER_SUMMARY_DIR`; asserts the 13 insertable columns against migration 296's CREATE TABLE and the summary file). F27 then PASSES locally; a mutation of the mapper (announced_at set to a date) turns the composition test and the 13-column test red. Fitness runner was run for F27 and F25 only, not the whole runner.
