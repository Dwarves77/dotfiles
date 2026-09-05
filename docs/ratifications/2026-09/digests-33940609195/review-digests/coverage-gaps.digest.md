# Ratification digest — Coverage gap candidates (coverage_gap_candidates.disposition IS NULL)

Queue: `coverage-gaps` · generated 2026-09-05T03:00:22.030Z · 91 row(s) in 37 group(s)

Rule on each group by setting its `decision` field in the companion JSON to one of: `kept`, `declined`, `parked`, `skip`.
Apply with: `node scripts/review/apply-coverage-gaps.mjs --apply --ruling <this-json-file>` (dry by default). Wired into the `review-apply-coverage-gaps` maintenance step.

## MISSING::eu::multi

- count: 17
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","HIGH","LOW"]
- examples:
  - Sweden EPR packaging producer-responsibility reporting to Naturvardsverket (Swedish EPA), regulation 2022:1274 — https://www.naturvardsverket.se/en/guidance/extended-producer-responsibility-epr/producer-responsibility-for-packaging/
  - Austria ARA (Altstoff Recycling Austria) dominant packaging-compliance system, no de minimis threshold — https://www.ara.at/en
  - Netherlands Verpact (formerly Afvalfonds Verpakkingen) national packaging EPR register, reporting to RVO — https://business.gov.nl/regulations/packaging/

## MISSING::global::multi

- count: 7
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","LOW","HIGH"]
- examples:
  - EPD International EPD Library (Environmental Product Declarations, ISO 14025/14040/14044-based, construction and packaging-relevant product categories) — https://www.environdec.com/library
  - IEA Hydrogen Tracker and Hydrogen Production and Infrastructure Projects Database — https://www.iea.org/data-and-statistics/data-tools/hydrogen-tracker
  - ICE (Intercontinental Exchange) EU carbon allowance futures and options (EUA, EUA 2) — https://ir.theice.com/press/news-details/2025/ICE-Launches-EU-Carbon-Allowance-2-Futures/default.aspx

## MISSING::latam::multi

- count: 6
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","HIGH"]
- examples:
  - Mexico CRE/CFE industrial electricity tariffs (Gran Demanda / Media Tension) — https://app.cfe.mx/Aplicaciones/CCFE/Tarifas/TarifasCREIndustria/Tarifas/GranDemandaMTH.aspx
  - Brazil ANEEL open-data tariff datasets (Tarifa de Energia / TUSD, distributor-level) — https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica
  - Mexico INEGI Encuesta Anual de Transportes (EAT) / ENOE, transport-postal-storage — https://www.inegi.org.mx/programas/eat/2018/

## MISSING::asia::ocean

- count: 5
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Singapore EMA regulated electricity tariff + Uniform Singapore Energy Price (USEP) — https://www.ema.gov.sg/resources/statistics/average-monthly-uniform-singapore-energy-price
  - South Korea KECO Resource Circulation Compliance System (EPR reporting and verification, Ministry of Environment) — https://www.keco.or.kr/en/lay1/S295T386C400/contents.do
  - Japan JCPRA (Japan Containers and Packaging Recycling Association) compliance reporting system, Container and Packaging Recycling Act — https://www.jcpra.or.jp/

## MISSING::global::air

- count: 5
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["HIGH","CRITICAL"]
- examples:
  - ICAO CAEP (Committee on Aviation Environmental Protection) meeting agendas and reports — https://www.icao.int/CAEP
  - IATA SAF Accounting Policy Paper (chain-of-custody-based book-and-claim accounting, "Policy 1") — https://www.iata.org/contentassets/d13875e9ed784f75bac90f000760e998/saf-accounting-policy-paper_20230905_final.pdf
  - ICAO CORSIA (Carbon Offsetting and Reduction Scheme for International Aviation) — https://www.icao.int/environmental-protection/CORSIA/Pages/default.aspx

## MISSING::global::ocean

- count: 4
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","HIGH"]
- examples:
  - UNCTADstat container port throughput database (annual, TEU, global port-level and aggregate) — https://unctadstat.unctad.org/datacentre/dataviewer/US.ContPortThroughput
  - Ship & Bunker world bunker prices (free daily port-level VLSFO/HSFO/MGO pricing, historical charts) — https://shipandbunker.com/prices
  - Freightos Baltic Index (FBX) — container freight rate index, 12 major global trade routes plus composite — https://www.freightos.com/freight-index/

## MISSING::uk::multi

- count: 4
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","HIGH"]
- examples:
  - BAFTA Albert certification and carbon calculator (UK screen-industry sustainability standard, film/TV production) — https://baftaalbert.org/
  - UK DESNZ Quarterly Energy Prices (non-domestic/industrial electricity, by consumption band) — https://www.gov.uk/government/collections/quarterly-energy-prices
  - UK Extended Producer Responsibility for packaging: public registers (producers, compliance schemes, reprocessors/exporters) — https://www.gov.uk/guidance/find-large-producers-on-the-report-packaging-data-service

## MISSING::eu::road

- count: 3
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Eurostat labour cost index (NACE H, transportation and storage) — https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev
  - EU End-of-Life Vehicles Regulation (ELV, circularity for automotive; provisional agreement Dec 2025) — https://environment.ec.europa.eu/topics/waste-and-recycling/end-life-vehicles_en
  - Poland BDO (Baza Danych o Produktach i Opakowaniach oraz o Gospodarce Odpadami) national products/packaging/waste database — https://bdo.mos.gov.pl/

## MISSING::meaf::air

- count: 3
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Switzerland revised CO2 Act (SR 641.71) + CO2 Ordinance, in force 1 Jan 2025 — https://www.fedlex.admin.ch/eli/cc/2022/824/en
  - Switzerland ElCom electricity price and tariff data (LINDAS linked-data service) — https://energy.ld.admin.ch/elcom/electricityprice-swiss
  - Switzerland BFS/OFS Swiss Earnings Structure Survey (ESS) — https://www.bfs.admin.ch/bfs/en/home/statistics/work-income/wages-income-employment-labour-costs/earnings-structure.html

## MISSING::meaf::road

- count: 3
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - South Africa NERSA-approved Eskom electricity tariffs (industrial/large-power-user) — https://www.nersa.org.za/
  - South Africa Carbon Tax Act 15 of 2019 (Phase 2 from 2026) + Climate Change Act 22 of 2024 — https://www.sars.gov.za/customs-and-excise/excise/environmental-levy-products/carbon-tax/
  - South Africa Stats SA Quarterly Employment Statistics (QES), transport sector — https://www.statssa.gov.za/?p=18527

## MISSING::asia::air

- count: 2
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["MODERATE","HIGH"]
- examples:
  - Japan METI/MLIT 10% SAF-by-2030 mandate (Basic Policy for Promoting Decarbonization in Aviation + Act on the Sophistication of Energy Supply Structures) — https://www.meti.go.jp/english/statistics/
  - CAAS Singapore Sustainable Air Hub Blueprint (mandatory SAF uplift target + levy, Changi/Seletar airports, from 2026) — https://www.caas.gov.sg/sustainability/sustainable-air-hub-blueprint/

## MISSING::asia::multi

- count: 2
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Japan MHLW Basic Survey on Wage Structure (via e-Stat), transportation and warehousing — https://www.e-stat.go.jp/en/statistics/00450091
  - Japan METI/ANRE General Energy Statistics (industrial electricity pricing) — https://www.meti.go.jp/english/statistics/

## MISSING::latam::road

- count: 2
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Mexico Emissions Trading System (Sistema de Comercio de Emisiones, SEMARNAT) — https://www.gob.mx/semarnat
  - Argentina Ley de Presupuestos Minimos de Adaptacion y Mitigacion al Cambio Climatico Global (Law 27.520 of 2019) + National Sustainable Transport Plan (2023) — https://www.argentina.gob.ar/ambiente/cambio-climatico/ley-27520

## MISSING::meaf::multi

- count: 2
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - UAE FCSA UAE.Stat labour force and wage statistics — https://uaestat.fcsc.gov.ae/en
  - UAE FCSA electricity tariff by entity, slab consumption and sector (federal statistical dataset) — https://uaestat.fcsc.gov.ae/vis?lc=en&fs%5B0%5D=FCSC+-+Statistical+Hierarchy%2C0%7CElectricity&df%5Bid%5D=DF_ELECTR_TCO&df%5Bag%5D=FCSA

## MISSING::us-ca::road

- count: 2
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - California CARB Advanced Clean Trucks / Advanced Clean Fleets repeal rulemaking (carried forward from Bank 4/rank 50 per operator ruling) — https://ww2.arb.ca.gov/rulemaking-activity
  - California CARB Rulemaking Activity tracker (Advanced Clean Trucks / Advanced Clean Fleets rulemaking dockets, origin jurisdiction for all Section 177 ACT-adopter states) — https://ww2.arb.ca.gov/rulemaking-activity

## MISSING::us::ocean

- count: 2
- recommended: **uncertain**
- coverage_class: MISSING
- priorities: ["LOW","HIGH"]
- examples:
  - PNNL Port Electrification Handbook (US maritime port shore-power and electrification reference) — https://www.pnnl.gov/projects/port-electrification-handbook
  - FMC (Federal Maritime Commission) tariff and surcharge monitoring (carrier-filed Green Surcharge / EU ETS-FuelEU cost-pass-through legitimacy) — https://www.fmc.gov/articles/fmc-monitoring-and-review-of-surcharges-and-fees/

## MISSING::us::road

- count: 2
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - BLS labor cost data (warehousing and transportation wage series) — https://api.bls.gov/publicAPI/v2/timeseries/data/
  - California Low Carbon Fuel Standard (LCFS) — https://ww2.arb.ca.gov/our-work/programs/low-carbon-fuel-standard/about

## AMBIGUOUS_ARCHIVED::global::ocean

- count: 1
- recommended: **parked**
- coverage_class: AMBIGUOUS_ARCHIVED
- priorities: ["HIGH"]
- examples:
  - IMO EEXI + CII (Energy Efficiency Existing Ship Index / Carbon Intensity Indicator), MEPC.328(76), MARPOL Annex VI Ch.4 — https://www.imo.org/en/mediacentre/hottopics/pages/eexi-cii-faq.aspx

## HAVE_QUARANTINED::asia::road

- count: 1
- recommended: **declined**
- coverage_class: HAVE_QUARANTINED
- priorities: ["LOW"]
- examples:
  - China national ETS extension to transport / heavy industry (MEE work plan, Mar 2025) — https://www.mee.gov.cn/

## HAVE_QUARANTINED::global::ocean

- count: 1
- recommended: **declined**
- coverage_class: HAVE_QUARANTINED
- priorities: ["HIGH"]
- examples:
  - IMO Net-Zero Framework / Green Fuel Intensity (GFI) standard + GHG pricing (MEPC 83, Apr 2025; adopted Oct 2025) — https://www.imo.org/en/mediacentre/pressbriefings/pages/imo-approves-netzero-regulations.aspx

## MISSING::asia::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - India Carbon Credit Trading Scheme (CCTS 2023) + fuel-efficiency (CAFE) norms — https://beeindia.gov.in/en/programmes/carbon-market

## MISSING::ca-bc::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - British Columbia Zero-Emission Vehicles Act (medium- and heavy-duty ZEV mandate, under development) — https://www2.gov.bc.ca/gov/content/industry/electricity-alternative-energy/transportation-energies/clean-transportation-policies-programs/zero-emission-vehicles-act

## MISSING::ca-qc::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Quebec zero-emission vehicles (ZEV) standard, heavy-duty expansion tracker — https://www.environnement.gouv.qc.ca/changementsclimatiques/vze/index-en.htm

## MISSING::de::multi

- count: 1
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - German Supply Chain Due Diligence Act (LkSG / Lieferkettensorgfaltspflichtengesetz) — https://www.bafa.de/EN/Supply_Chain_Act/supply_chain_act_node.html

## MISSING::global::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - FIA Environmental Accreditation Programme (motorsport/mobility 3-star sustainability framework, ISO 14001/20121/EMAS-based) — https://www.fia.com/environmental-accreditation-programme

## MISSING::meaf::ocean

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["LOW"]
- examples:
  - Saudi Arabia National Transport and Logistics Strategy (2021) + Saudi Green Initiative (logistics/ports) — https://mot.gov.sa/en/ntls

## MISSING::uk::road

- count: 1
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - UK ONS labour cost / earnings data (ASHE by SIC, transport and storage) — https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/regionbyindustry2digitsicashetable5

## MISSING::us-co::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Colorado CDPHE Clean Trucking program and Regulation 20 (5 CCR 1001-24) rulemaking tracker — https://cdphe.colorado.gov/cleantrucking

## MISSING::us-ma::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Massachusetts DEP 310 CMR 7.40 (Low Emission Vehicle Program / Advanced Clean Trucks) rulemaking tracker — https://www.mass.gov/regulations/310-CMR-700-air-pollution-control

## MISSING::us-md::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["LOW"]
- examples:
  - Maryland MDE COMAR 26.11.43 (Advanced Clean Trucks Program) rulemaking-documents tracker — https://mde.maryland.gov/programs/regulations/air/Documents/2023%20ACT%20Fact%20Sheet%2005.24.23%20AQCAC.pdf

## MISSING::us-nj::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - New Jersey DEP Advanced Clean Trucks rulemaking and fleet-reporting tracker — https://dep.nj.gov/stopthesoot/advanced-clean-trucks-rule-fleet-reporting/

## MISSING::us-ny::road

- count: 1
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - New York 6 NYCRR Part 218 -- Heavy-Duty Vehicle Emission Standards (Advanced Clean Trucks + Heavy-Duty Omnibus + Phase 2 GHG, CARB-aligned) — https://dec.ny.gov/regulations/regulatory-agenda

## MISSING::us-or::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Oregon DEQ Clean Truck Rules rulemaking tracker — https://www.oregon.gov/deq/rulemaking/pages/ctr2025.aspx

## MISSING::us-ri::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["LOW"]
- examples:
  - Rhode Island DEM Advanced Clean Cars II and Advanced Clean Trucks mobile-sources tracker — https://dem.ri.gov/environmental-protection-bureau/air-resources/mobile-sources/advanced-clean-cars-ii-advanced-clean

## MISSING::us-vt::road

- count: 1
- recommended: **parked**
- coverage_class: MISSING
- priorities: ["MODERATE"]
- examples:
  - Vermont DEC Advanced Clean Trucks program and enforcement-status page — https://dec.vermont.gov/air-quality/mobile-sources/zero-emission-vehicles/ACT

## MISSING::us-wa::road

- count: 1
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - Washington Department of Ecology WAC 173-423 Clean Vehicles Program rulemaking tracker — https://ecology.wa.gov/regulations-permits/laws-rules-rulemaking/rulemaking/wac-173-423-clean-vehicles-program

## MISSING::us::multi

- count: 1
- recommended: **kept**
- coverage_class: MISSING
- priorities: ["HIGH"]
- examples:
  - EIA industrial electricity retail pricing (state-filterable) — https://api.eia.gov/v2/electricity/retail-sales/data/
