# 2026-10-08 lane S8-E1 (s8e1-oem-roadmap): a registered producer for oem_tech_roadmaps from the EEA heavy-duty vehicle CO2 extract

Domain 1.1 of spec 09. Fixtures only, nothing applied, no database. Branch lane/s8e1-oem-roadmap, committed locally and NOT pushed (see "Waiting on a grant").

## Dataset (every item below is [CONFIRMED] by the one fetch session of 2026-10-08, header in fixtures/eea-hdv-sample.header.json)

- EEA "CO2 emissions from heavy-duty vehicles", vehicle extract `HDV_CO2Emission_VehicleExtract_24042025.csv`, vehicle level, 461 columns, UTF-8 with a byte order mark, CRLF, quoted fields. Full file 4,029,364,100 bytes, `Last-Modified: Mon, 28 Apr 2025 10:29:17 GMT`, `Accept-Ranges: bytes`. Dataset page: Published 29 Apr 2025, temporal coverage 2019-2023.
- Licence text on the EEA catalogue record, quoted: "License CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright holder: Directorate-General for Climate Action (DG-CLIMA), European Environment Agency (EEA)." The licence register key `eea` (src/lib/contracts/source-licence.mjs) already says redistribution permitted, CC BY 4.0.
- Fixture: first 71 complete records, 187,542 bytes, byte for byte. All 71 are one manufacturer (DAF Trucks N.V.), zero-emission flag "No", engine fuel "Diesel CI". It proves the parser and the aggregation; it contains no zero-emission vehicle.

## Accomplished

- `fsi-app/scripts/producers/oem/eea-hdv-csv.mjs`: streaming RFC 4180 reader (chunk-boundary independent, BOM, CRLF, quoted newlines) and an aggregator that folds the extract into groups by manufacturer and powertrain columns; `maxBytes` read with the half record dropped and the result marked truncated.
- `eea-hdv-map.mjs` + `eea-hdv-classification.json`: groups to the 13 insertable columns of oem_tech_roadmaps; strict config validation (closed category and stage sets).
- `eea-hdv-co2-producer.mjs`: fetch adapter (injected fetch, Range header for a dry sample), four apply gates (ENABLED constant shipped false, `OEM_PRODUCER_EEA_HDV_ENABLED`, DB credentials, complete read), source gate, idempotent plan keyed (manufacturer, technology, source), guarded writes with cite, producers-family summary on every path (edges_authored null: this table carries no derivation edges).
- `fsi-app/scripts/producers/registry/eea-hdv-co2.json` (`in_all: false`: one read streams 4 GB, so it runs when named, never in the producer=all sweep).
- Migration 380, NOT APPLIED: outbox trigger on oem_tech_roadmaps in 352's form `('roadmap_id','manufacturer_id')`, and `announced_at` made nullable. Static test with the shared fixture-INSERT checker; regenerated `docs/inventories/migrations.md`; `build-applied-map.mjs --add-never --write` added `never:380_...`.
- `load-registry.test.mjs`: the exact-equality pin on the four original entries became a superset check (granted by the coordinator's message).

## Columns

- Covered: manufacturer_id (existing organisation entity only, never minted), tech_category, commercial_stage, source_id, origin_class `official`, derivation `observed`.
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

## Why the shipped run writes 0 rows (stated, not hidden)

The sample proves only conventional rows, so three pieces of reference data are not in evidence and none was written down (rule 2): (1) the values the extract uses in its fuel columns for a zero-emission vehicle, so `zev_tech_rules` is empty and every zero-emission group is reported as residue `zero_emission_unmapped`; (2) the registered-vehicle counts that separate the four commercial stages, so `stage_rules` is empty and a group that would map is residue `no_stage_rule`; (3) the entity each manufacturer string maps to, so `manufacturer_aliases` is empty and unresolved manufacturers are listed by name in the residue (the work list). The mechanism for all three is built and tested with a SYNTHETIC config; the ruling lands as data in `eea-hdv-classification.json`, which validates strictly.

## Read and reused

Read in full: CLAUDE.md, lane-common-contract, COMMON and the producers-e brief, the PROD-SRC register (section 0 and 1.1), spec 09, the S8-E0 session log, migrations 296 and 352 (and 311, 373 by diff), `load-registry.mjs`, `run-registered.mjs` and their tests, `producers-workflow.test.mjs`, `producer-summary-wiring.test.mjs`, `producer-summary.mjs`, `ecb-fx-producer.mjs`, `scripts/spec09/oem-roadmap-producer.mjs`, `scripts/spec09/lib/rows-file.mjs`, `scripts/spec09/SOURCES.md`, `rate-source-by-class.mjs`, `db.mjs` registerSource, `OemRoadmapPanel.tsx` and its View, `oem-payload.mjs`, `questions-on-change.mjs` and its test, `_lib/fixture-inserts.mjs`, the L4-E diff and log.
Reused instead of built: `rateSourceByInstitutionClass` and `registerSource` (rating and registration), `resolveEntityByName` (rows-file.mjs), `writeProducerSummary`, `isMainModule`, `loadLocalEnvFile`, the registry loader and runner unchanged, 352's trigger form, the shared fixture-INSERT checker, the S8-E0 registry directory. Nothing in the repo parsed this dataset or a streaming CSV with quoted newlines (searched `parseCsv`, `csv` readers).

## Red then green

Each new test file was run before its module existed: `ERR_MODULE_NOT_FOUND` for `eea-hdv-csv.mjs`, `eea-hdv-map.mjs` and `eea-hdv-co2-producer.mjs`; then 8, 14 and 18 tests pass. The registry pin: `load-registry.test.mjs` failed against the new entry ("the real registry lists the four moved producers") and passes after the granted superset change. Migration 380: a mutation (trigger reduced to one argument, DROP NOT NULL turned into SET NOT NULL) turned two tests red; restored, 9 of 9 pass. Combined run of the touched files: 153 tests, 0 failures.

## Confirmed facts for follow-up lanes

- oem_tech_roadmaps HAS a reader: `src/components/market/OemRoadmapPanel.tsx` (server component, selects roadmap_id, tech_category, commercial_stage, target_year, density_basis, confidence_admiralty, announced_at) and `OemRoadmapPanelView.tsx`. Neither enumerates tech_category or commercial_stage from a constant (`git grep` for the eight category names, the four stage names and for TECH_CATEGOR / COMMERCIAL_STAGE under src found nothing), they print the value with underscores replaced, so nothing new needs wiring. The View's `OemRoadmapRow.announced_at` type is `string`; it is never rendered, so a NULL changes no output. The empty-state line still says "source: none confirmed ... no $0 structured feed", which is stale once rows exist (not touched, outside the write set).
- A second writer of the table exists, `scripts/spec09/oem-roadmap-producer.mjs` (reviewed rows file, via maintenance.yml). The two key different rows (it cites a per-row source; this one cites the EEA source), and this producer never matches or updates rows of another source.
- `entity_id` on the registry entry (L4-E's field) was NOT added: that PR (#1026) is unmerged so the loader on master refuses the field, and it would be inert here, since the field only feeds `PRODUCER_ENTITY_ID` to the market_series write path; this table's entity is the manufacturer, resolved by the trigger's second argument.

## Waiting on a grant (NEEDS WRITE-SET EXPANSION), and why the branch is not pushed

1. `fsi-app/src/lib/learning/questions-on-change.mjs`: migration 380 attaches propagation_outbox_trg to oem_tech_roadmaps, and `questions-on-change.test.mjs` ("every table that emits outbox events has a mapping") then fails: "emitting table(s) with no event mapping: oem_tech_roadmaps" [CONFIRMED by running it with 380 in the tree]. Needed: one `EMITTING_TABLE_EVENT_MAP` entry, `oem_tech_roadmaps: Object.freeze({ type: "value_revised", byKind: Object.freeze({}), label: "an OEM equipment roadmap row" })`, plus the table row in the header comment.
2. Reference data to fill the empty config (not an edit grant, a ruling or evidence): the EEA table definition (`https://sdi.eea.europa.eu/catalogue/srv/api/records/22fd286c-9737-4b38-b2bb-1f7a7d3e9916/attachments/HDV-tabledefinition.xlsx`, found on the dataset page) to evidence the zero-emission fuel values; the stage thresholds; and the manufacturer to entity aliases from a real run's residue list.

## Disclosed deviation

The brief permits one network fetch (the fixture sample). The URL was not named in the brief, so finding it took the EEA register URL (redirected to the datahub page), two more reads of that page, then the CSV request itself (190,000 bytes read, connection closed). One WebFetch to a guessed URL returned 404 and was a mistake. No other host was contacted and nothing else was fetched.

## NOT done

Not pushed, no PR, no CI watch (grant 1 above). ENABLED stays false; nothing applied or run against live data; the config rules, stage thresholds and aliases above are empty.
