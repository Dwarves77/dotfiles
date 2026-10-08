# PROD-SRC fact lane: public datasets behind spec 09's domains

> Landed in docs/audits/ on 2026-10-08 by the coordinator docs lane DOCS-3 from the register's scratch copy (source path: fsi-app/scripts/tmp/prodsrc-public-datasets-2026-10-08.md). The body below is the register verbatim; only the form of status tokens was touched where the checker required it. Statements below about a scratch location or a gitignored copy describe where the file lived before it landed.

Date: 2026-10-08. Base: origin/master e23feb02. Fact lane, read-only register, no repo changes, no proposals.
Lenses run: EXISTS (of external datasets). Subsystem: 16 producers. Unit: each domain, each table column group.
QUESTION: for each domain and column group, which PUBLIC, FREE, machine-readable dataset (API, CSV, bulk download,
stable HTML table) supplies it, under what licence, in what format, at what cadence?

Status tokens (CLAUDE.md rule 14): [CONFIRMED] = I fetched the page or endpoint this session and saw the stated
fields or text. [HYPOTHESIS] = from a search snippet, a page that did not render, or inference; not verified.
[REFUTED] = investigated and found false.

Method limits, stated so the tokens are read correctly:
- WebFetch passes each page through a small summarising model. [CONFIRMED] means the summary returned the field or
  quote from fetched content; it does not mean I read the raw bytes. Where I fetched a PDF I read the extracted text
  (pdftotext) and say so. JSON metadata endpoints (UKPN Opendatasoft, IMF ArcGIS) were read as returned.
- These hosts did not render or refused: unctad.org (403),
  hapag-lloyd.com (403), eur-lex.europa.eu (empty), data.jrc.ec.europa.eu (rejected), iscc-system.org (404),
  eex.com English path (404), several globaldrivetozero.org and nlr.gov paths (404). Anything that depended on them
  is [HYPOTHESIS].
- "Producer-ready" in the tables below uses only the ecb-fx entry's model (registry file ecb-fx.json: a named
  source, a stated licence, a keyless stable endpoint, a dry-capable script). It is a fact column, not a proposal.

## 0. Findings that change the unit list (read first)

F0.1 [CONFIRMED, method: read of repo files at e23feb02, not a live DB read] The brief names seven domains (spec 09
sections 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8). Migration 349_external_data_only.sql header states "APPLIED 2026-10-03"
and DROPs surcharge_audits, tce_data_quality (1.4), eudr_plot_claims and custody_chains (1.8). Spec 09 itself marks
1.2, 1.4 and 1.8 "superseded and removed" (ADR-042). So 1.4 and 1.8 have NO live table. I still researched them
because the brief lists them, and I map each external dataset to the dropped table's columns (DDL read from
migrations 297 and 298). Live tables per repo files: oem_tech_roadmaps, indexation_clauses (296);
auxiliary_energy_profiles, grid_connection_queues (297); reroute_events (296). That is five live tables.
F0.2 [CONFIRMED, repo file] scripts/spec09/SOURCES.md says carrier_compliance_pools was dropped by migration 311.
Spec 1.2 is out of scope by brief; noted only so the table count is not misread.
F0.3 [CONFIRMED, repo file] scripts/spec09/SOURCES.md already records every one of the five live tables as "none
confirmed" for a public source, with unconfirmed leads: ZETI, Ofgem/ENA for grid queue, IMO for reroutes. This
register supersedes those leads with what a fetch showed (sections 1.x below).
F0.4 [CONFIRMED, repo file] Columns that are system-assigned and no dataset supplies: oem_tech_roadmaps.source_id,
origin_class, derivation, confidence_admiralty; grid_connection_queues.obs_status; every table's surrogate id and
created_at; every entity FK (corridor_id, manufacturer_id, jurisdiction_id, node_id, index_id, claimant_id) resolves
against the internal entity spine. They appear below as "n/a system" and are not counted as uncovered.

## 1.1 OEM equipment roadmap: table oem_tech_roadmaps (migration 296)

Column groups (DDL read column by column):
- G1 identity: manufacturer_id (entity FK), tech_category (8-value closed set)
- G2 stage and time: commercial_stage (4 values), target_year, announced_at
- G3 energy specs: energy_density_wh_kg, density_basis (cell/module/pack, required if density present), c_rate_max,
  usable_kwh
- G4 provenance: source_id, origin_class, derivation, confidence_admiralty (n/a system)

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | California HVIP vehicle catalog, californiahvip.org/vehicles/ | California HVIP (CARB program) | "Copyright (c) 2026 California HVIP. All rights reserved." (no open licence) | HTML list, 212 vehicles; page offers "Download the full catalog" in PDF and CSV | continuous, undated | none stated | G1 manufacturer + tech type (Battery Electric, Hydrogen Fuel Cell); G3 usable_kwh only as "battery capacity (kWh)", basis unstated; G2 status (active or archived) only | page fields [CONFIRMED]; CSV link not rendered [HYPOTHESIS] |
| B | CALSTART ZETI tool v9.16, globaldrivetozero.org/tools/zero-emission-technology-inventory/ | Catalyst Mobility (Drive to Zero) | "Catalyst Mobility (2026)" copyright; no licence terms on the page | interactive tool | "continuously updated" | none stated | G2 "the timeline over which additional models are expected to become available" (stated scope); G1 | tool exists [CONFIRMED]; any download or field list [HYPOTHESIS] (data-explorer page 404 on fields) |
| C | IEA Global EV Data Explorer (GEVO 2026 dataset) | IEA | page states "CC BY 4.0" | dataset download (format not shown) | annual; "Last updated 20 May 2026" | not stated | country-level sales, stock, charging; no manufacturer rows seen | licence and date [CONFIRMED]; truck or OEM coverage [HYPOTHESIS] |
| D | EEA CO2 monitoring of heavy-duty vehicles, eea.europa.eu/data-and-maps/data/co2-emission-hdv | EEA | EEA reuse policy, fetched: "The EEA publishes materials under the CC-BY 4.0 licence" (summary of policy; attribution: EEA "always acknowledged as the original source") | CSV, TXT, SQL | annual, July to June periods; latest listed 2019-2023, a newer 2023-2024 set reported by search | none | G1 manufacturer, fuel and ZEV flag; evidence of G2 stage (registered units); no kWh, no density | formats, cadence, licence [CONFIRMED]; field list [HYPOTHESIS] (page cites a table-definition file it did not show) |
| E | ICAO SAF production facilities tracker, icao.int/SAF/SAF-production-facilities | ICAO | no licence text; one disclaimer: "significant uncertainty on the share of this capacity that will be directed to SAF" | dashboard with a "capacities" tab | not stated | none; submissions by form | tech_category saf_refinery G1; G2 existing, announced, dormant status | tracker and disclaimer [CONFIRMED]; no download found |
| F | DNV Alternative Fuels Insight (AFI), dnv.com/services/alternative-fuels-insights-afi/ | DNV | "Free access provides an overview and shared baseline." Export is paid | web platform | monthly orderbook news; platform live | none stated | tech_category methanol_dualfuel and ammonia_engine (vessel orderbook) | free tier and paid export statement [CONFIRMED] |
| G | AFDC Vehicle Search, afdc.energy.gov/vehicles/search/ | US DOE | no terms text on the fetched page | web search UI; page links Developer APIs | not stated | yes (linked; docs URL tried returned 404) | G1 class, fuel, manufacturer filters | page [CONFIRMED]; battery kWh field [HYPOTHESIS] |
| H | IEA Hydrogen Production and Infrastructure Projects Database | IEA | search snippet: "CC BY 4.0" | Excel and CSV via .Stat | annual, "updated on 18/06/2026" | .Stat | hydrogen supply projects, not OEM equipment | all [HYPOTHESIS] (snippet only, not fetched) |
| I | Methanol Institute methanol-fuelled vessel list (PDF, "Methanol Marine July 2023") | Methanol Institute | not retrieved | PDF | 2023 edition seen | none | methanol_dualfuel vessels and engines | [HYPOTHESIS], stale |

Per column group:
- G1 manufacturer_id and tech_category: covered by D (EU registrations, CC BY via EEA policy) and A (US, all rights
  reserved); partially by E (saf_refinery) and F (vessels, export paid). Not covered for e_axle,
  megawatt_charging, reefer_electrification: no candidate shows those categories.
- G2 commercial_stage: partially covered (A status, D registrations, E facility status). target_year and
  announced_at: UNCOVERED by any free machine-readable dataset found; only ZETI states a timeline and no download
  was confirmed. OEM announcements live on manufacturer press pages (HTML free text), consistent with SOURCES.md.
- G3 usable_kwh: partially covered by A (kWh, basis unstated, US catalog, not openly licensed).
  energy_density_wh_kg, density_basis, c_rate_max: UNCOVERED. No candidate shows pack mass, Wh/kg or C-rate.
- G4: n/a system.
Paid or licensed alternatives (terms as stated by the vendor, price not disclosed): DNV AFI paid tier, "Our paid
subscriptions are designed for users who need deeper benchmarking and decision-making support" and export "for
further internal analysis"; plans are listed through the Veracity marketplace, no price on the page [CONFIRMED].
No vendor with quotable terms was found for pack-level Wh/kg or C-rate. Coordinator reports to operator; no pick.

## 1.3 Dynamic carbon contract indexation: table indexation_clauses (migration 296, kept by 349)

Column groups:
- G1 index reference: index_id (entity FK to EUA front-Dec, UKA, TTF), base_value, base_date
- G2 contract binding: contract_ref, corridor_id (customer contract identifiers, n/a system or internal)
- G3 clause mechanics: passthrough_pct, cap_pct, floor_pct, review_cadence (monthly, quarterly, semiannual),
  rounding_rule

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | Ember carbon price viewer, ember-energy.org/data/carbon-price-viewer/ | Ember | "All content is released under a Creative Commons Attribution Licence (CC-BY-4.0)." Data source named: Montel | interactive viewer; page names no download | "Updated daily" | the Ember API docs expose three datasets (yearly and monthly electricity, wind and solar capacity), no carbon price | G1 EUA and UKA, front December contract | viewer, licence, source [CONFIRMED]; download, and whether CC BY extends to Montel-origin prices [HYPOTHESIS] |
| B | World Bank Pink Sheet monthly prices | World Bank | World Bank default: CC BY 4.0, "allows users to copy, modify and distribute data in any format for any purpose, including commercial use" | XLS | monthly; page: "Next update: November 3, 2026" | none | G1 TTF only, via "Natural gas, Europe" | XLS, cadence, default licence [CONFIRMED]; TTF column and that Pink Sheet is under the default [HYPOTHESIS] |
| C | ICAP Allowance Price Explorer | ICAP | "may only be reproduced, redistributed and used for non-commercial purposes subject to ICAP's prior written permission." | in-tool tables; file format not stated | weekly average ICE data, 6-month lag (EU ETS from 2019, UK ETS from May 2021) | none stated | G1 EUA, UKA (weekly, lagged) | terms and series [CONFIRMED]; licence excludes commercial use |
| D | EEX EUA primary auction reports | EEX | no terms on the download page; footer links Disclaimer, not shown | Excel (2026), ZIP history 2012-2025 | per auction | none seen | EUA auction spot price, not the front-December futures index | download list [CONFIRMED]; licence [HYPOTHESIS] |
| E | UK ETS auction results (ICE Futures Europe) | ICE for the UK ETS Authority | gov.uk guidance page: "licensed under the terms of the Open Government Licence v3.0 except where otherwise stated" (the guidance page, not the results) | results file location not found | auction calendar | none found | UKA auction clearing price | [HYPOTHESIS] |
| F | ICE Futures Europe and ICE Endex market data (EUA, UKA, TTF futures) | ICE | licensed product: "ICE FUTURES TECHNOLOGY & MARKET DATA FEES 2027" lists a "Redistribution License Fee (Non-Member)" for "Real Time, Delayed and Historical" data, amounts in the $5,000 to $30,000 per year range (column alignment ambiguous in extracted text) | feed | real time | yes | G1 for all three indices | fee schedule text [CONFIRMED]; applicability to a given use [HYPOTHESIS] |
| G | Carrier ETS surcharge methodology pages (Hapag-Lloyd; MSC publishes a formula) | carriers | page refused (403) | HTML | quarterly update | none | G3 evidence only: search result states EUA price "sourced from the ICEDEU3 Index using a three-month average", "updated quarterly" | [HYPOTHESIS] (snippet only) |

Per column group:
- G1 index_id, base_value, base_date: partially covered. TTF monthly: B. EUA and UKA daily front-December: A shows
  the series in a viewer under a stated CC BY 4.0, but no downloadable file or API for carbon price was confirmed,
  and its upstream is Montel. C is non-commercial only. D and E give auction prices, a different instrument. Paid:
  F. No free confirmed machine-readable endpoint with a commercial-use licence for EUA or UKA front-December found.
- G2 contract_ref, corridor_id: UNCOVERED by any dataset (a customer's own contract identifiers).
- G3 passthrough_pct, cap_pct, floor_pct, rounding_rule: UNCOVERED (private contract terms; no public dataset).
  review_cadence: only carrier-published precedent (G, quarterly), [HYPOTHESIS].
Paid or licensed alternatives: F above (ICE). Montel: terms not retrieved. BIMCO and FIATA model clauses: not
fetched, terms unknown.

## 1.4 DQI and primary data share: dropped table tce_data_quality (migration 297, dropped by 349)

Column groups: G1 tce_id (caller-supplied element id); G2 five axes (reliability, completeness,
temporal_correlation, geographical_correlation, technological_correlation, 1 best to 5 worst); G3
primary_data_share (0..1); G4 primary_evidence (text).

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | UK GHG conversion factors for company reporting, gov.uk collection | UK DESNZ | "All content is available under the Open Government Licence v3.0, except where otherwise stated" | annual publication plus methodology report (spreadsheet format not shown on the page) | annual; 2026 edition published 31 July 2026 | none | emission factors only (default, secondary data); none of G1 to G4 | licence, edition, cadence [CONFIRMED]; freight rows and xlsx [HYPOTHESIS] |
| B | CountEmissionsEU databases | European Commission with EEA | agreement text: "two free public databases for emissions data" | databases not yet built | apply "48 months after entry into force" | n/a | default and primary emissions data under ISO 14083; none yet | agreement statement [CONFIRMED]; not available now |
| C | GLEC Framework v3.2 (Oct 2025) | Smart Freight Centre | terms not retrieved (publisher page rendered navigation only) | document | v3.2 released October 2025 per search | none | defines the method and default intensities; no DQI score values | [HYPOTHESIS] |
| D | ISO 14083:2023 | ISO | purchased standard; price not retrieved | PDF | n/a | none | method only | [HYPOTHESIS] |

Per column group:
- G1 tce_id: UNCOVERED (a caller's own identifier).
- G2 five DQI axes: UNCOVERED. No public dataset supplies per-element DQI scores; A and C supply default factors,
  which are secondary data, and the pedigree-style axes are scores about a specific operator's data.
- G3 primary_data_share, G4 primary_evidence: UNCOVERED (properties of a specific operator's telemetry or receipts).
Paid or licensed alternatives: ISO 14083 standard (price and terms not retrieved). No paid dataset of DQI values
located.

## 1.5 Auxiliary energy profiles: table auxiliary_energy_profiles (migration 297, kept by 349)

Column groups: G1 load_type (6 values), node_id (entity FK); G2 kw_draw, duty_cycle, hours_typical; G3 setpoint_c,
setpoint_rh_pct; G4 grid_intensity_source (names a source of gCO2/kWh).

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | Container Handbook 8.1.2 "Actual power consumption", containerhandbuch.de | GDV (German insurers) | legal notice not in the fetched text | HTML prose and a table image | static | none | G2 kw_draw for reefer containers: "approximately 4.2 kW" at -21 C, "7 - 8 kW" at +16 C for a 40 ft unit at 45 C ambient, "3.6 kW/TEU" average (as returned by the summary) | values [CONFIRMED as returned]; licence [HYPOTHESIS] |
| B | Bizot Green Protocol, 2023 refresh (hosted nationalmuseums.org.uk) | Bizot Group | no licence text in the extracted PDF text | PDF | "Latest refresh: September 2023" | none | G3 setpoints: extracted text "a stable relative humidity (RH) is required in the range of 40 - 60%" and "stable temperature in the range 16 - 25" C, fluctuation limit 10% RH per 24 h | text [CONFIRMED by pdftotext]; licence [HYPOTHESIS] |
| C | EIA CBECS 2018 warehouse and storage tables | US EIA | "U.S. government publications are in the public domain and are not subject to copyright protection." | HTML tables, microdata | irregular (2018 survey, released 2021) | none seen | annual kWh per sq ft (search result: 28.8 refrigerated vs 5.8 per sq ft); an intensity, not a kW draw, US only | policy [CONFIRMED]; the figures [HYPOTHESIS] (snippet) |
| D | Carbon Intensity API | NESO | page states "CC BY 4.0"; also "API Terms of Use" on GitHub | JSON, XML | forecast and history (cadence not shown on page) | yes | G4 GB national and 17 regions | endpoints and licence [CONFIRMED]; keyless [HYPOTHESIS] |
| E | Ember electricity data API | Ember | "All content is released under a Creative Commons Attribution Licence (CC-BY-4.0)." | JSON via API key | yearly (200+ geographies) and monthly (88); "last updated March 20, 2026" | yes, key required | G4 generation, emissions, demand by geography | [CONFIRMED] |
| F | EPA eGRID | US EPA | no licence statement on the fetched page | Excel (eGRID2023_data_rev2.xlsx) | latest "eGRID with 2023 Data", released 15 Jan 2025 | none | G4 US subregion CO2e rates | file and date [CONFIRMED]; licence [HYPOTHESIS] |
| G | EEA greenhouse gas intensity of electricity indicator | EEA with Eurostat | EEA policy as in 1.1 D | indicator page; data via Eurostat and EEA viewer | annual; 1990 to 2024, EU27 | not shown | G4 EU27 gCO2e/kWh | years and sources [CONFIRMED]; download format [HYPOTHESIS] |

Per column group:
- G1 load_type, node_id: n/a vocabulary and internal entity.
- G2 kw_draw: partially covered (A for reefer containers only). Reefer genset, airport climate hold, warehouse
  HVAC (as kW), battery conditioning, dehumidification: no candidate shows kW. Manufacturer spec sheets
  (Carrier, Thermo King) were searched and not retrieved: [HYPOTHESIS]. duty_cycle and hours_typical: UNCOVERED.
- G3 setpoint_c, setpoint_rh_pct: covered for museum holds as ranges by B (PDF, not a table). Setpoints for
  reefer cargo, pharma and dehumidification: UNCOVERED.
- G4 grid_intensity_source: covered by D (GB), E (global, key), F (US), G (EU27).
Paid or licensed alternatives: none located for kW or duty cycle. ASHRAE handbook chapters: terms not retrieved.

## 1.6 Grid connection queue: table grid_connection_queues (migration 297, kept by 349)

Column groups: G1 jurisdiction_id (entity FK), dso_name; G2 capacity_band_mw; G3 queue_months_p50,
queue_months_p90 (p90 >= p50); G4 as_of; G5 obs_status (n/a system).

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | UKPN LTDS Table 6 New Connection Interest, ukpn-ltds-table-6-interest-connections | UK Power Networks | "CC BY 4.0" | Opendatasoft: JSON, CSV | "Annual (twice yearly)"; processed 2026-09-21; 933 records | yes, ukpowernetworks.opendatasoft.com/api/explore/v2.1 | fields gridsupplypoint, substation, proposed_connection_voltage_kv, status_of_connection, demand_numbers_received_total_number and _capacity, generation equivalents; no months | [CONFIRMED] |
| B | UKPN LTDS Capacity Heatmap, ukpn-capacity-heatmap | UK Power Networks | "You are free to share and adapt the material for any purpose, even commercially, provided you give appropriate credit." (CC BY 4.0) | Opendatasoft | twice yearly; 967 records | yes | demandAvailableCapacity, demandConstraint, generationAvailableCapacity, area, mrid, lat, lon; no months | [CONFIRMED] |
| C | UKPN Overall Queue Insights, ukpn-overall-queue-insights | UK Power Networks | "CC BY 4.0" | Opendatasoft | monthly; 20 records | yes | Technology, Status, Contracted DERs (MW): GENERATION pipeline, not demand | [CONFIRMED] |
| D | Liander "Transportschaarste (Beschikbare capaciteit elektriciteitsnet)" | Liander via data.overheid.nl | "CC-BY (4.0)" | HTML landing page, resources not listed | last updated 12-12-2022 | none seen | capacity availability categories for large consumers; no months; stale | metadata [CONFIRMED]; fields [HYPOTHESIS] |
| E | CPUC energization targets (D.24-09-020) fact sheet | California PUC | no licence text in the extracted PDF text | PDF | decision of 2024 | none | policy targets, calendar days: average 182 for each of Rule 15, 16, 15/16 combined, 29/45, application decision; maxima 357, 335, 306, 335; substation upgrade maximum 684 and new substation 1,021 calendar days (extracted table). A regulatory target, not observed queue months; PG&E, SCE, SDG&E only | text [CONFIRMED by pdftotext]; that utility data spreadsheets are filed under seal [HYPOTHESIS] (snippet) |
| F | Netbeheer Nederland capaciteitskaart, capaciteitskaart.netbeheernederland.nl | Dutch grid operators | none retrieved | map | updated regularly | none found | the map reports queue size per station, MW requested, planned commissioning | fetch returned an error page; all [HYPOTHESIS] |
| G | ERCOT large load queue; NESO demand connections; Ofgem time-to-connect by DNO | ERCOT, NESO, DNOs | not retrieved | monthly PDFs; documents | various | none seen | MW by stage (ERCOT), project counts (NESO), days for small connections (DNO regulatory reports); no months by capacity band | [HYPOTHESIS] (snippets) |

Per column group:
- G1 jurisdiction_id: n/a internal. dso_name: covered per dataset (A to D name the operator).
- G2 capacity_band_mw: partially covered. A and B give MW per substation and proposed kV, not bands.
- G3 queue_months_p50 and queue_months_p90: UNCOVERED. No free dataset with queue duration in months by capacity
  band was found among the candidates fetched. Nearest facts: CPUC maximum calendar days (E), DNO days for small
  connections (G, hypothesis), MW queued without durations (A, B, ERCOT).
- G4 as_of: covered by each dataset's processed date (A: 2026-09-21; B: 2026-07-23; C: 2026-08-18).
- G5: n/a system.
Paid or licensed alternatives: none located with quotable terms. The Berkeley Lab "Queued Up" generator
interconnection data was not fetched and is generation-side (SOURCES.md already warns against conflating).

## 1.7 Geopolitical rerouting multipliers: table reroute_events (migration 296, kept)

Column groups: G1 baseline_corridor_id, reroute_corridor_id (entity FKs, n/a internal); G2 cause (text);
G3 distance_delta_nm, transit_delta_days; G4 fuel_burn_multiplier (> 0); G5 effective_from, effective_to.

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | IMF PortWatch Daily_Chokepoints_Data, services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0 | IMF with University of Oxford | layer metadata copyright field empty. IMF terms fetched: "For any potential commercial reuse of IMF Data, email copyright@imf.org to request permission." Recommended citation: "Sources: UN Global Platform; IMF PortWatch" | ArcGIS REST JSON, keyless | daily rows; latest row seen 2026-10-04 | yes (ArcGIS query) | G5 evidence of when transits shifted: fields date, portid, portname, n_container, n_dry_bulk, n_general_cargo, n_roro, n_tanker, n_total, capacity_*; chokepoint list (28) includes Suez Canal, Bab el-Mandeb Strait, Cape of Good Hope | service, fields, chokepoints, latest date [CONFIRMED]; PortWatch-specific licence [HYPOTHESIS] |
| B | IMF PortWatch chokepoints database layer | IMF | as A | ArcGIS REST | static attributes | yes | portid, portname, country, ISO3, lat, lon, vessel_count_*, industry_top1-3, shares of country maritime trade | [CONFIRMED] |
| C | Eurostat SeaRoute, github.com/eurostat/searoute | Eurostat | "EUPL-1.2" | Java library over a shipping-lane network (Oak Ridge CTA Global Shipping Lane Network 2000 plus European AIS-based lines) | repository maintained | library, not a web API | G3 distance_delta_nm is computable: tool handles Suez, Bab-el-Mandeb and lets the user "avoid specific channels"; output is a model, not an observation | [CONFIRMED] |
| D | NGA Publication 151 Distances Between Ports | US NGA | search snippet: "NO COPYRIGHT CLAIMED UNDER TITLE 17 U.S.C." (2001 edition) | PDF | 2001 edition seen | none | G3 port-to-port distances | [HYPOTHESIS]; the NOAA PDF I fetched is a different publication (US ports), not Pub 151 |
| E | UNCTAD Review of Maritime Transport 2024, chapter 2 | UNCTAD | page refused (403) | PDF | annual | none | G3 and G4 context: search results state Singapore to Rotterdam 8,288 nm via Suez vs 11,755 nm via the Cape, and "a 1% increase in speed typically leads to a 2.2% rise in fuel consumption" for container ships | [HYPOTHESIS] (snippets) |

Per column group:
- G1: n/a internal.
- G2 cause: UNCOVERED by a dataset (event narrative). Not searched beyond the above (IMO, UKMTO, JMIC advisories
  not fetched).
- G3 distance_delta_nm: computable from C over the same port pair with and without Suez; D or E give hypothesis
  values. transit_delta_days: UNCOVERED as a dataset (derivable from distance and speed, a model).
- G4 fuel_burn_multiplier: UNCOVERED. No dataset publishes a multiplier; E states a speed to fuel relation
  [HYPOTHESIS].
- G5 effective_from, effective_to: evidence covered by A (daily transits at Suez, Bab el-Mandeb, Cape of Good
  Hope), commercial reuse needs IMF permission per the quoted clause.
Paid or licensed alternatives: Searoutes and Lloyd's List were not fetched; terms unknown.

## 1.8 EUDR geo-traceability and custody: dropped tables eudr_plot_claims, custody_chains (migration 298, dropped by 349)

Column groups, eudr_plot_claims: G1 consignment_ref; G2 geometry_json, area_ha; G3 validation_state (missing,
malformed, valid, fails_cutoff); G4 hold_risk (none, documentary, border_hold); G5 dds_reference.
custody_chains: G6 credit_type, scheme, certificate_ref; G7 retired_at, retirement_registry; G8
double_count_check; G9 claimant_id.

| # | Candidate | Publisher | Licence (quoted) | Format | Cadence | API | Columns covered | Token |
|---|---|---|---|---|---|---|---|---|
| A | JRC Global Forest Cover 2020 V2 | EC JRC | search snippet: data "may be used by anyone, anywhere, anytime without permission, license or royalty payment" | 10 m raster; Earth Engine catalogue entry exists and is tagged "[deprecated]" in its title | released 7 Dec 2024 | Earth Engine | basis for G3 fails_cutoff checks against a 2020 forest map; needs a geometry input | [HYPOTHESIS] (snippets; JRC catalogue fetch rejected) |
| B | Commission Implementing Regulation (EU) 2025/1093 country benchmarking | European Commission | EUR-Lex fetch returned empty; reuse notice not retrieved | OJ text | act of 22 May 2025 | none | country risk: four high risk (Belarus, Myanmar, North Korea, Russia), 140 low risk, rest standard | [HYPOTHESIS] (snippets) |
| C | EUDR application timing, Regulation (EU) 2025/2650 | European Union | not retrieved | OJ text | published 23 Dec 2025 | none | application 30 Dec 2026 for large operators, 30 June 2027 for small and micro (snippets) | [HYPOTHESIS] |
| D | ISCC public certificate database, iscc-system.org/certification/certificate-database/valid-certificates/ | ISCC | not retrieved | web search tool; download unknown | not stated | none known | G6 scheme, certificate_ref, holder (search says 12,000+ valid certificates) | URL 404 on fetch; all [HYPOTHESIS] |
| E | EU ETS data viewer and EUTL public information | European Commission, EEA | EEA policy as in 1.1 D (viewer page itself 404 on fetch) | Excel crosstab download from the viewer per a search snippet | annual | none | G6 ets_allowance holdings, surrenders, account holders (aggregated by installation) | [HYPOTHESIS] |

Per column group:
- G1 consignment_ref, G2 geometry_json and area_ha, G5 dds_reference: UNCOVERED by design (a consignment's own
  data, not a public dataset). A is the nearest external layer for G3 and needs a geometry as input.
- G3 validation_state: partially (A as the 2020 reference map, hypothesis).
- G4 hold_risk: UNCOVERED. No public dataset of border holds found in the searches run.
- G6 credit_type, scheme, certificate_ref: D (hypothesis); ets_allowance: E (hypothesis).
- G7 retired_at, retirement_registry, G8 double_count_check: UNCOVERED. No public cross-registry retirement or
  double-claim dataset found.
- G9 claimant_id: n/a internal.
Paid or licensed alternatives: none located with quotable terms (voluntary-scheme registries such as RSB and the
SAF book-and-claim registries were not fetched).

## 2. Best candidate per domain (summary, tokens as above)

| Domain | Best [CONFIRMED] candidate | What it does not cover |
|---|---|---|
| 1.1 OEM roadmap | EEA HDV CO2 monitoring (CC BY via EEA policy, CSV, annual) for manufacturer, fuel and stage evidence | target_year, announced_at, Wh/kg, density_basis, C-rate; HVIP catalog has kWh but "All rights reserved" |
| 1.3 Indexation | Ember carbon price viewer (CC BY 4.0, daily, EUA and UKA front-December; Montel upstream, no download confirmed); World Bank Pink Sheet monthly for TTF (default CC BY, TTF column unverified) | all clause mechanics; ICAP is non-commercial; licensed ICE data is paid |
| 1.4 DQI (table dropped) | none free | all five axes, primary share, evidence; UK DESNZ factors (OGL v3.0) are default factors only |
| 1.5 Aux energy | NESO Carbon Intensity API and Ember API (both CC BY 4.0) for grid intensity; Bizot 2023 PDF for museum setpoint ranges | duty_cycle, hours_typical, kW outside reefer containers |
| 1.6 Grid queue | UKPN Opendatasoft datasets (CC BY 4.0, API, twice yearly) for demand-side MW and constraints | queue_months_p50 and p90; capacity bands |
| 1.7 Reroute | IMF PortWatch ArcGIS service (keyless, daily to 2026-10-04) for dates; Eurostat SeaRoute (EUPL-1.2) for distance | multiplier, cause, transit days; PortWatch commercial reuse needs IMF permission |
| 1.8 EUDR and custody (tables dropped) | none [CONFIRMED]; best [HYPOTHESIS] JRC GFC2020 V2 and Reg 2025/1093 | hold_risk, retirement, double count |

## 3. Read and reused

Read in full: CLAUDE.md (repo root), docs/dispatches/lane-common-contract.md, docs/specs/09-domain-extensions.md,
migrations 296, 297, 298 (DDL column by column), 349 header and drop list,
docs/ops/session-log.d/2026-10-07-s8e0-producer-registry.md, scripts/producers/registry/ecb-fx.json,
the ecb-fx producer header, scripts/spec09/SOURCES.md, scripts/spec09/grid-queue-rows-file.example.json.
Reused instead of re-deriving: SOURCES.md's per-table gap statements and the migration 349 table list.
Created: this one file only. No worktree, branch, or repo change.
