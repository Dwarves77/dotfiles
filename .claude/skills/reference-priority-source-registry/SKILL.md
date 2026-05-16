---
name: reference-priority-source-registry
description: Curated URL list of priority sources by category. Authoritative sources to check when running updates or onboarding new sources. Long list; this is reference data, not a vocabulary. The canonical machine-readable source registry lives in `sources` table; this skill is the human-curated authoritative list.
---

# Reference: priority-source-registry

## Source

Original `environmental-policy-and-innovation` skill, "Priority Source Registry" section.

## Purpose

When running updates, onboarding new sources, or auditing source coverage, this list is the human-curated authoritative starting point. The machine-readable source registry lives in the live `sources` table (794 rows as of audit). When the two diverge, this list is the design intent and the database should be reconciled to it.

## Primary regulatory authorities

| Source | URL | Tier | Role |
|---|---|---|---|
| IMO | imo.org/en/mediacentre, imo.org/en/ourwork/environment | T2 | intergovernmental_body |
| EUR-Lex | eur-lex.europa.eu/oj/daily-view | T1 | primary_legal_authority |
| EU CLIMA | climate.ec.europa.eu/eu-action/transport-decarbonisation | T1 | primary_legal_authority |
| CBAM | taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en | T1 | primary_legal_authority |
| FuelEU | transport.ec.europa.eu/transport-modes/maritime/fueleu-maritime_en | T1 | primary_legal_authority |
| ReFuelEU | transport.ec.europa.eu/transport-modes/air/refueleu-aviation_en | T1 | primary_legal_authority |
| EUDR | environment.ec.europa.eu/topics/forests/deforestation/regulation_en | T1 | primary_legal_authority |
| EPA | epa.gov/regulations-emissions-vehicles-and-engines | T1 | primary_legal_authority |
| CARB | ww2.arb.ca.gov | T1 | primary_legal_authority |
| ICAO | icao.int/CORSIA | T2 | intergovernmental_body |
| UNFCCC | unfccc.int/NDCREG | T2 | intergovernmental_body |
| World Bank | carbonpricingdashboard.worldbank.org | T4 | industry_data_provider |
| EMSA MRV | mrv.emsa.europa.eu | T2 | intergovernmental_body |
| EU Council | consilium.europa.eu/en/press/press-releases | T1 | primary_legal_authority |
| EU Commission | ec.europa.eu/commission/presscorner/home/en | T1 | primary_legal_authority |
| Federal Register | federalregister.gov/developers/documentation/api/v1 | T1 | primary_legal_authority |
| Climate Laws | climate-laws.org | T3 | academic_research |
| EEA | eea.europa.eu | T2 | intergovernmental_body |

## Industry bodies + standards

| Source | URL | Tier | Role |
|---|---|---|---|
| FIATA | fiata.org | T5 | industry_association |
| ICCT | theicct.org/sector/freight | T3 | academic_research |
| Smart Freight Centre | smartfreightcentre.org | T3 | standards_body |
| GHG Protocol | ghgprotocol.org | T3 | standards_body |
| SBTi | sciencebasedtargets.org | T3 | standards_body |
| ISSB/IFRS | ifrs.org/sustainability | T3 | standards_body |
| IEA | iea.org/policies/about | T4 | industry_data_provider |
| Sabin Center | climate.law.columbia.edu | T3 | academic_research |
| CDP | cdp.net/en/supply-chain | T4 | industry_data_provider |
| ISO | iso.org/standard/78864.html | T3 | standards_body |
| Maritime Carbon Intelligence | maritimecarbonintelligence.com | T5 | trade_press |

## Asia + LatAm regulatory portals

- China: flk.npc.gov.cn (T1)
- India: egazette.gov.in (T1)
- Singapore: sso.agc.gov.sg (T1)
- Korea: elaw.klri.re.kr (T1)
- Brazil: gov.br Diário Oficial (T1)
- Chile: bcn.cl/leychile (T1)

## Industry + research press

FreightWaves, GreenBiz, Reuters Sustainable Business, The Loadstar, Splash247, JOC, Lloyd's Register, Getting to Zero Coalition, ZEMBA, First Movers Coalition, E-Fuel Alliance, Mission Innovation, H2 Accelerate, NREL, Project Drawdown.

## Operator + competitive intelligence sources

Vessel/fuel announcements: Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE, Evergreen, ZIM (T7 corporate_press for press releases; T5 trade_press when reported through industry outlets).

Forwarder activity: FedEx, UPS, DHL, Kuehne+Nagel, DB Schenker, DSV, Expeditors (T7 corporate_press; T5 trade_press when reported through industry outlets).

Air cargo activity: Lufthansa Cargo, Air France-KLM Cargo, Cargolux, IAG Cargo, Emirates SkyCargo, Qatar Airways Cargo (T7 corporate_press).

## Update protocol

When the operator says "update the skill" or runs source-coverage maintenance:

1. Web-search each source above for changes since the last sync
2. For each change: identify what changed (proposed rule, guidance, court ruling, agency action), severity, affected modes/verticals, cost impact range
3. Apply [[rule-no-regulatory-inferences-as-fact]] when summarizing regulatory changes
4. New sources discovered during search go to [[classifier-source-onboarding]] for proper 5-axis classification
5. Source-conflict detection per [[rule-source-tier-hierarchy]]
6. Update the live `sources` table; reconcile this skill file with new entries

## Composition

Used by:
- [[classifier-source-onboarding]] — when a new source is encountered, this list is checked first for prior coverage
- [[operational-audit-dispatch-pattern]] — source-coverage audits use this list as the reference baseline
- [[writer-regulatory-fact-document]] — Section 15 (Sources) cites from these where applicable

Related:
- v2 audit Section 6.2 (source registry as a curated product)
- The live sources table (`sources`) — when sync happens, both should agree
