# Spec 09 producers — $0 sourcing status per table

Lane SPEC-09, wave 3, 2026-09-03. Every producer in this directory is dry-by-default, takes `--apply`
(alias `--mode apply`), and never calls an LLM or a paid service ($0 rule, COMMON lane contract). This
file names, per table, either the $0 public source a producer fetches or the honest reason none exists —
per the lane brief's own instruction: "where no free source exists the table ships empty with the gap
named."

Nine of the ten spec-09 tables ship 0 rows from this lane. That is not an oversight: every one of them is
either (a) fed by data a CUSTOMER supplies (an uploaded invoice, a signed contract, a shipment's own
telemetry) that this product has no upload flow for yet, or (b) fed by a bulk-download dataset that either
does not exist at $0/public terms, or exists but this session could not confirm well enough to trust
(rule 2: never fabricate — an unconfirmed dataset is treated as absent, not guessed at).

| Table | Producer | $0 source | Status |
|---|---|---|---|
| `surcharge_audits` | `surcharge-audit-producer.mjs` | none | GAP: requires a customer-uploaded carrier invoice (the input the calculation is ABOUT — spec 09 §1.2's own worked example is "the customer's own invoice"). No invoice-upload flow exists in this product yet (out of this lane's write set — `src/app/api/**` is not ours to add to). Ships 0 rows; the calculator (`src/lib/spec09/surcharge-audit.mjs`) and schema are ready the moment an upload path exists. |
| `carrier_compliance_pools` | `surcharge-audit-producer.mjs` (same file — see header) | THETIS-MRV (EMSA), public but not parsed this lane | GAP: THETIS-MRV publishes verified per-vessel CO2 data at $0, but a full bulk parser was out of this lane's time budget, AND spec 09 §5 open decision 1's conservative default holds pool-position inference internal regardless — building the parser would not change what is surfaced. Named, not built. |
| `oem_tech_roadmaps` | `oem-roadmap-producer.mjs` | none confirmed | GAP: OEM commercial-stage announcements live on manufacturer press pages (BYD, Volvo Trucks, Scania, Daimler Truck, ...), not a structured bulk feed. Parsing free-text press releases without an LLM (the $0/no-LLM rule) is not viable at useful accuracy; no aggregator with a stable, licence-clear API was confirmed at $0 in the time available. Ships 0 rows. |
| `indexation_clauses` | `indexation-producer.mjs` | none (by design) | GAP: this table stores CONTRACT-SPECIFIC terms (base_value/base_date frozen at a real signature) — there is no bulk public source for another company's contract terms, by the nature of the data, not a sourcing failure. Genuinely customer-entry-only; ships 0 rows until a contract-entry flow exists. |
| `reroute_events` | `reroute-producer.mjs` | entity spine (read-only) | GAP, DIFFERENT SHAPE: the Suez/Cape Red Sea diversion is well-documented public fact, but this table requires TWO distinct `entities.kind='corridor'` rows (baseline + reroute — the exact fix spec 09 §0 exists to make representable) and only ONE corridor entity exists in the spine today (`CNSHA-NLRTM:ocean`, lane CORR's wave-2 seed). Minting a second corridor entity is entities/entity_kind territory (COMMUNITY-A/CORR's write set, not this lane's). The producer reads live corridor entities and reports exactly this count-of-2 gap rather than fabricating a second corridor id itself. |
| `tce_data_quality` | `dqi-producer.mjs` | none | GAP: DQI is scored from a shipment's own primary evidence (carrier telemetry, fuel receipts, verified MRV) — customer/shipment-specific, not a bulk public dataset. Ships 0 rows. |
| `auxiliary_energy_profiles` | `auxiliary-energy-producer.mjs` | none for the profile itself; grid intensity is separately available | GAP: `kw_draw`/`duty_cycle`/`setpoint` are asset-specific facts about a customer's own reefer/hold/warehouse — no public bulk source describes another company's equipment. (`grid_intensity_source` — Ember/EEA gCO2/kWh — already has a path into this product via `regional_data_facts`, migration 106, populated by other lanes' producers; this table only NAMES that source, it does not need to re-fetch it.) Ships 0 rows. |
| `grid_connection_queues` | `grid-queue-producer.mjs` | none confirmed | GAP: no $0 structured feed was confirmed for DSO/TSO connection-queue MONTHS by capacity band. UK National Grid ESO's TEC register and ENA's Distribution Future Energy Scenarios describe GENERATION connection queues, not the demand-side queue this table needs, and conflating the two would be exactly the kind of fabrication rule 2 forbids. Ships 0 rows; a future producer is named as a gap, not built on an unconfirmed guess. |
| `eudr_plot_claims` | `eudr-custody-producer.mjs` | none (by design) | GAP: EUDR due-diligence statements are filed per-consignment through the EU's own TRACES system, not bulk-downloadable. Ships 0 rows. |
| `custody_chains` | `eudr-custody-producer.mjs` (same file) | ISCC/RSB/SFC public certificate lookups exist, no bulk API confirmed | GAP: certificate registries have public single-lookup web portals, not a bulk/API feed this session could confirm at $0. Ships 0 rows. |

**Sequenced per spec §4**: `surcharge-audit-producer.mjs` was written first, matching the calculator and
component build order.
