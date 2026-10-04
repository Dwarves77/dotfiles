# Spec 09 producers — $0 sourcing status per table

Lane SPEC-09, wave 3, 2026-09-03. Narrowed by lane EXTERNAL-ONLY, 2026-10-03 (ADR-042). Every producer in this directory is dry-by-default, takes `--apply` (alias `--mode apply`), and
never calls an LLM or a paid service ($0 rule, COMMON lane contract). This file names, per table, either
the $0 public source a producer fetches or the honest reason none exists.

## Operator-supplied external rows only (ADR-042, 2026-10-03)

The customer-upload flow (the workspace CSV route, its Settings card and the six-table customer-data
contract) was REMOVED by ADR-042. Operator ruling, 2026-10-03: the customer does not upload anything; the
system takes external data and advises what it means. Four customer-only tables (`surcharge_audits`,
`tce_data_quality`, `eudr_plot_claims`, `custody_chains`) and their panels, libraries and producers were
removed, and migration 349 drops the tables. Two tables remain, each with a reader and a producer:

- **`scripts/spec09/lib/operator-rows-contract.mjs`**: the one shared column contract
  (`parseOperatorRows`, `entityRefValuesForTable`, `validateEntityRefs`) for exactly the two kept tables,
  imported by both producers. Header states: operator-supplied external public-source rows only, never
  customer data.
- **`scripts/spec09/*-producer.mjs`** (`auxiliary-energy`, `indexation`): coordinator-dispatched CLI
  (`--mode apply --csv <path> --org-id <uuid>`) for a reviewed rows file of external public-source data.
  This is the ADR-023 operator-dispatch ingest path. No app route writes these tables.

Public-source intake for these two tables is owed (coordinator design): neither has a public bulk source
confirmed today, so both ship 0 rows until one is designed.

A fixture CSV per table (`scripts/spec09/fixtures/*.csv`) proves both the accept and reject paths;
`scripts/spec09/run-fixture-import.mjs` runs both through the identical parse, stamp, insert, read-back
pipeline with a deps-injected fake insert (no live DB credentials) and writes a JSON artifact to
`scripts/_snapshots/spec09-operator-rows/` (gitignored).

| Table | Producer | Reader | Org-scoped (migration 311) |
|---|---|---|---|
| `auxiliary_energy_profiles` | `auxiliary-energy-producer.mjs` | none for the profile itself; grid intensity is separately available | GAP: no public bulk source describes stationary auxiliary loads. The customer-entry path was removed by ADR-042. (`grid_intensity_source`, Ember/EEA gCO2/kWh, already has a path into this product via `regional_data_facts`, migration 106; this table only NAMES that source.) Ships 0 rows. Public-source intake is owed (coordinator design). |
| `indexation_clauses` | `indexation-producer.mjs` | `IndexationPanel` (Market) | yes |

## `carrier_compliance_pools` — DROPPED this lane (migration 311), not given a reader

Spec 09 names Market as the only surface that could ever read this table, but migration 296's own header
already stated its one customer-reachable column (`surcharge_audits.pool_adjusted_eur`) is deliberately
never populated, and its calculator guard refused to surface it (spec 09 section 5 open decision 1's
conservative default, left unmade; the calculator was removed by ADR-042). This lane's brief required either building the
reader or dropping the table with 0 rows confirmed; 0 rows were confirmed live (read-only SELECT,
2026-09-05, and re-checked by migration 311's own precondition), and a reader for a value the calculator
layer refuses to surface would only relocate the unmade operator decision into a new, useless UI element
rather than resolve it. Dropped along with `surcharge_audits.pool_id` and `.pool_adjusted_eur`
(`variance_eur` — the ALWAYS-renderable billed-vs-statutory sentence — is untouched). THETIS-MRV (EMSA)
remains the $0 public source that WOULD have fed this table, named here only so a future operator decision
to reverse this drop knows where the data lives.

## Remaining wave-3 gaps, unchanged by this lane (outside SPEC09-B's write set — see its own W5.1 sub-thread)

| Table | Producer | $0 source | Status |
|---|---|---|---|
| `oem_tech_roadmaps` | `oem-roadmap-producer.mjs` | none confirmed | GAP: OEM commercial-stage announcements live on manufacturer press pages (BYD, Volvo Trucks, Scania, Daimler Truck, ...), not a structured bulk feed. Parsing free-text press releases without an LLM (the $0/no-LLM rule) is not viable at useful accuracy; no aggregator with a stable, licence-clear API was confirmed at $0 in the time available. Ships 0 rows. **Lane SPEC09-A (2026-09-05):** the producer now also accepts a reviewed `--rows-file` (see `scripts/spec09/lib/rows-file.mjs` — every row requires a `citation` block rated through `src/lib/sources/host-authority.ts` and registered via `registerSource`; `manufacturer_id` resolves against the live `entities(kind='organisation')` spine, 1,293 rows, e.g. `volvotrucks.com`, and is never minted). Candidate lead named for the browser-lane worklist, **not confirmed this session (egress blocked to every non-allowlisted host)**: CALSTART's Global Commercial Vehicle Drive to Zero Zero-Emission Technology Inventory (ZETI), `globaldrivetozero.org/tools/zeti-tool/` — [HYPOTHESIS]. Note: neither that host nor a manufacturer's own press site classifies under the current institution class table (`oem_tech_roadmaps.source_id` is NOT NULL, so such a row is refused until an operator ruling adds a class-table entry). See `scripts/spec09/oem-roadmap-rows-file.example.json` (DRAFT, unreviewed, placeholder values only). |
| `indexation_clauses` | `indexation-producer.mjs` | none confirmed | GAP: no public bulk source for index-linked contract terms is confirmed. The customer-entry path was removed by ADR-042. Ships 0 rows. Public-source intake is owed (coordinator design). |
| `reroute_events` | `reroute-producer.mjs` | entity spine (read-only) | GAP, DIFFERENT SHAPE: the Suez/Cape Red Sea diversion is well-documented public fact, but this table requires TWO distinct `entities.kind='corridor'` rows (baseline + reroute — the exact fix spec 09 §0 exists to make representable) and only ONE corridor entity exists in the spine today (`CNSHA-NLRTM:ocean`, lane CORR's wave-2 seed) [CONFIRMED, live SQL, 2026-09-05]. Minting a second corridor entity is entities/entity_kind territory (COMMUNITY-A/CORR's write set, not this lane's; lane CORRIDORS-STATUTORY is seeding a second corridor concurrently). The producer reads live corridor entities and reports exactly this gap rather than fabricating a second corridor id itself. **Lane SPEC09-A (2026-09-05):** once >=2 corridors exist, the producer accepts a reviewed `--rows-file` (cause/multiplier/dates + a `citation` block per row, rated + registered exactly like `oem_tech_roadmaps` above) to write the actual reroute event(s) — see `scripts/spec09/reroute-rows-file.example.json` (DRAFT, unreviewed; candidate citation lead is IMO's Red Sea situation coverage, [HYPOTHESIS], not confirmed this session). |
| `auxiliary_energy_profiles` | `auxiliary-energy-producer.mjs` | none for the profile itself; grid intensity is separately available | GAP: no public bulk source describes stationary auxiliary loads. The customer-entry path was removed by ADR-042. (`grid_intensity_source`, Ember/EEA gCO2/kWh, already has a path into this product via `regional_data_facts`, migration 106; this table only NAMES that source.) Ships 0 rows. Public-source intake is owed (coordinator design). |
| `grid_connection_queues` | `grid-queue-producer.mjs` | none confirmed | GAP: no $0 structured feed was confirmed for DSO/TSO connection-queue MONTHS by capacity band. UK National Grid ESO's TEC register and ENA's Distribution Future Energy Scenarios describe GENERATION connection queues, not the demand-side queue this table needs, and conflating the two would be exactly the kind of fabrication rule 2 forbids. Ships 0 rows; a future producer is named as a gap, not built on an unconfirmed guess. **Lane SPEC09-A (2026-09-05):** the producer now also accepts a reviewed `--rows-file` (same shared plumbing as `oem_tech_roadmaps`; `jurisdiction_id` resolves against the live `entities(kind='jurisdiction')` spine, 63 rows, e.g. `GB`, and is never minted). Candidate lead for the browser-lane worklist, **not confirmed this session**: Ofgem's Connections Reform DNO Connections Register / ENA's Open Data Portal — [HYPOTHESIS], and specifically whether either publishes a DEMAND-side (not generation-side) queue-months table at this granularity. See `scripts/spec09/grid-queue-rows-file.example.json` (DRAFT, unreviewed). |

## `statutory_computations` (FuelEU Annex IV) — not a spec-09 table, cross-linked here for the pattern

Lane FUELEU-ROWS, 2026-09-06 (audit W3-W4 finding 3). `scripts/propagation/write-statutory.mjs`, not a
spec-09 producer, follows the SAME rows-file-driven pattern this file documents for the six spec-09 tables
above (no live $0 bulk feed exists for the ship-year figures it needs — see
`docs/runbooks/FUELEU-STATUTORY-RUNBOOK.md` for the full account). $0 source for the regulation's own
published period constants (GHG intensity limits, reference value, penalty-formula constants):
`eur-lex.europa.eu` (CELEX:32023R1805, T1 in `src/lib/sources/host-authority.ts`'s LEGAL_PRIMARY class) —
transcribed into `scripts/propagation/fixtures/fueleu-annex-i-iv-statutory-constants-2026-09-06.json`.
GAP, same shape as `carrier_compliance_pools` above: the per-ship-year figures
(`ghgIntensityActual`/`energyUsedMJ`/`consecutiveDeficitYears`) are published only through EMSA's public
THETIS-MRV register (`mrv.emsa.europa.eu`, T2, GOV_INTERGOV class) — confirmed this session to be a
JS single-page app `WebFetch` cannot render (page metadata only, no per-ship search results) — so a
browser-capable lane is still needed to source the first real row. `statutory_computations` = **0 rows**
[CONFIRMED, read-only SQL, 2026-09-06], unchanged by this lane.
