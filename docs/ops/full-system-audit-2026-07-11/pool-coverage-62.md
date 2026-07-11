# Pool-coverage table — the 62 quarantined-with-deferral items (DB-1, 2026-07-11)

Question per item: does its stored `agent_run_searches` pool contain enacted-text sufficient for resynth
at floor authority? Method = the read-only pattern of
`fsi-app/scripts/_reconciliation-2026-07-11/pool-winnability-probe.mjs`: resolver =
`buildResolver(sources)` from `src/lib/sources/institution.ts` (1,197 registry rows), floor =
`authorityFloorFor(item_type)` (all 62 are reg-family → floor 2), floor rows = pool rows whose
`result_url` resolves to tier ≤ floor AND `result_content_excerpt` > 200 chars.

Verdicts: **COVERED** = floor rows exist, ≥10KB combined floor-source text, ≥1 tier≤2 (official/legal)
host · **PARTIAL** = floor rows exist but <10KB · **NOT-COVERED** = 0 floor-qualifying rows.
Probe: `fsi-app/scripts/tmp/db1-pool-coverage-62.mjs` (read-only; raw JSON beside it). Population =
`scripts/_snapshots/2026-07-11T04-57-58-373Z_floor-class-flip-defer.jsonl` (58 flips + 007f42b1,
8c186db2, g14, o9).

**Totals: 45 COVERED · 8 PARTIAL · 9 NOT-COVERED.**

| # | key | title | type | floor | pool | floorRows | floorKB | floor hosts (≤4) | verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | g27 | UN SDGs 9 & 13 | framework | 2 | 14 | 2 | 6 | unece.org, w3.unece.org | PARTIAL |
| 2 | 576554b3 | UK Transport Decarbonisation Plan | guidance | 2 | 21 | 7 | 73 | iuk-business-connect.org.uk, theccc.org.uk, legislation.gov.uk, gov.uk | COVERED |
| 3 | g13 | Brazil Logística Reversa | regulation | 2 | 7 | 2 | 28 | gov.br | COVERED |
| 4 | green-building-certification-standards-for-logistics | Green Building Certification Standards for Logistics | standard | 2 | 23 | 8 | 84 | ladbs.org, bca.gov.sg, nyc.gov, energystar.gov | COVERED |
| 5 | india-green-credit-programme-for-transport | India Green Credit Programme for Transport | regulation | 2 | 6 | 1 | 14 | pib.gov.in | COVERED |
| 6 | 0f70a032 | Maine DEP Mobile Sources Program | guidance | 2 | 14 | 6 | 54 | maine.gov, epa.gov | COVERED |
| 7 | 3ae89ce6 | EU HDV CO2 Standards: 2025 Automotive Package | regulation | 2 | 18 | 8 | 171 | climate.ec.europa.eu, eur-lex.europa.eu, transport.ec.europa.eu | COVERED |
| 8 | 6a8036a0 | Community of European Railways - Org Overview | guidance | 2 | 7 | 2 | 8 | transport.ec.europa.eu, employment-social-affairs.ec.europa.eu | PARTIAL |
| 9 | uae-national-hydrogen-strategy-implementation-decree-for-logistics | UAE Nat. Hydrogen Strategy Implementation Decree | regulation | 2 | 6 | 0 | 0 | — | NOT-COVERED |
| 10 | japan-green-transformation-gx-freight-transport-standards | Japan GX Freight Transport Standards | regulation | 2 | 9 | 4 | 20 | meti.go.jp, enecho.meti.go.jp, mlit.go.jp | COVERED |
| 11 | a4 | UK SAF Mandate | regulation | 2 | 7 | 5 | 46 | commonslibrary.parliament.uk, legislation.gov.uk, gov.uk | COVERED |
| 12 | uae-national-net-zero-by-2050-transport-sector-roadmap | UAE Net Zero 2050 Transport Roadmap | regulation | 2 | 6 | 1 | 5 | moccae.gov.ae | PARTIAL |
| 13 | 27dfbe4c | China's Environmental Code | regulation | 2 | 21 | 0 | 0 | — | NOT-COVERED |
| 14 | 55f90df0 | IMO MEPC Resolution 338(76) | regulation | 2 | 17 | 4 | 90 | gov.uk, wwwcdn.imo.org, imo.org | COVERED |
| 15 | uk-streamlined-energy-and-carbon-reporting-secr-amendment | UK SECR Amendment | regulation | 2 | 17 | 3 | 23 | gov.uk | COVERED |
| 16 | eu-battery-regulation-2023-1542 | EU Battery Regulation 2023/1542 | regulation | 2 | 8 | 4 | 34 | unece.org, eur-lex.europa.eu, environment.ec.europa.eu | COVERED |
| 17 | 87ed781c | Wisconsin 2023 State Freight Plan | framework | 2 | 7 | 4 | 29 | wisconsindot.gov, wisdotplans.gov, federalregister.gov | COVERED |
| 18 | la-eweo-existing-buildings-energy-water-efficiency | LA EWEO | regulation | 2 | 6 | 3 | 17 | data.lacity.org, energy.ca.gov, dbs.lacity.gov | COVERED |
| 19 | g15 | Colombian Ministry of Transport | regulation | 2 | 7 | 4 | 1 | mintransporte.gov.co | PARTIAL |
| 20 | india-s-national-logistics-policy-carbon-intensity-standards | India Nat. Logistics Policy Carbon Intensity | regulation | 2 | 7 | 4 | 48 | pib.gov.in, dpiit.gov.in | COVERED |
| 21 | g7 | Germany BMDV | regulation | 2 | 7 | 4 | 34 | bmdv.bund.de, umweltbundesamt.de, bmv.de, bundesregierung.de | COVERED |
| 22 | 0f2e42ed | SEMARNAT Challenge Validation Guidance | guidance | 2 | 7 | 2 | 11 | gob.mx, epa.gov | COVERED |
| 23 | 0f46aabf | Slovenia NECP 2030-2040 Preparation | framework | 2 | 8 | 3 | 27 | gov.si, commission.europa.eu | COVERED |
| 24 | 40c05a1e | Weights & Dimensions Directive 96/53/EC revision | regulation | 2 | 8 | 2 | 44 | europarl.europa.eu, eur-lex.europa.eu | COVERED |
| 25 | australia-national-electric-vehicle-strategy | Australia National EV Strategy | regulation | 2 | 11 | 4 | 2 | infrastructure.gov.au, dcceew.gov.au | PARTIAL |
| 26 | 50ccd5cc | SFC GLEC Framework v3.0 release | framework | 2 | 8 | 1 | 7 | umweltbundesamt.de | PARTIAL |
| 27 | a7 | GLEC Framework (Air Freight) | standard | 2 | 7 | 0 | 0 | — | NOT-COVERED |
| 28 | china-s-national-carbon-market-extension-to-transportation-sector | China Nat. Carbon Market Extension to Transport | regulation | 2 | 6 | 0 | 0 | — | NOT-COVERED |
| 29 | o6 | EU MRV Regulation | regulation | 2 | 8 | 3 | 71 | eur-lex.europa.eu | COVERED |
| 30 | de2df788 | Connecticut HDV Emissions Standards & ZEV | guidance | 2 | 14 | 12 | 172 | portal.ct.gov, federalregister.gov, epa.gov | COVERED |
| 31 | 39b5dc20 | South Dakota DOT Carbon Reduction Strategy | regulation | 2 | 7 | 5 | 43 | dot.sd.gov, federalregister.gov, uscode.house.gov, highways.dot.gov | COVERED |
| 32 | japan-s-green-transformation-gx-league-transport-requirements | Japan GX League Transport Requirements | framework | 2 | 7 | 2 | 7 | meti.go.jp | PARTIAL |
| 33 | 0ea6a710 | NY State Truck & Motor Carrier Rules | regulation | 2 | 34 | 9 | 105 | dot.ny.gov, nyc-business.nyc.gov, fmcsa.dot.gov | COVERED |
| 34 | 4c81cebd | Arkansas E&E Division of Environmental Quality | guidance | 2 | 11 | 6 | 46 | adeq.state.ar.us, ee.arkansas.gov | COVERED |
| 35 | 5511a87f | NY DEC Regulatory Framework | framework | 2 | 7 | 6 | 83 | dec.ny.gov, nysenate.gov | COVERED |
| 36 | 5b9b05c7 | Florida DEP NPRM Chapter 62-210 | regulation | 2 | 12 | 8 | 62 | floridadep.gov, federalregister.gov | COVERED |
| 37 | c5 | GLEC Framework v3 | standard | 2 | 6 | 0 | 0 | — | NOT-COVERED |
| 38 | g19 | South Korea MOF | regulation | 2 | 6 | 1 | 5 | mof.go.kr | PARTIAL |
| 39 | c7 | SBTi | regulation | 2 | 8 | 0 | 0 | — | NOT-COVERED |
| 40 | cea40062 | National Logistics Plan (BR) | framework | 2 | 7 | 3 | 24 | gov.br, trimis.ec.europa.eu | COVERED |
| 41 | uk-mees-commercial-building-minimum-energy-efficiency | UK MEES | regulation | 2 | 6 | 2 | 19 | gov.uk | COVERED |
| 42 | 4ff5cf56 | Wyoming DEQ CCR Permit Program | regulation | 2 | 20 | 1 | 10 | epa.gov | COVERED |
| 43 | uae-national-hydrogen-strategy-transport-sector-requirements | UAE Hydrogen Strategy - Transport Requirements | regulation | 2 | 6 | 1 | 14 | trade.gov | COVERED |
| 44 | g24 | ASEAN Transport Strategic Plan | framework | 2 | 7 | 0 | 0 | — | NOT-COVERED |
| 45 | b040b08c | LADBS Green Building Guidance May 2026 | guidance | 2 | 7 | 4 | 35 | dbs.lacity.gov, data.lacity.org | COVERED |
| 46 | fabda0e7 | Oregon DEQ Central Hub | guidance | 2 | 7 | 6 | 61 | oregon.gov | COVERED |
| 47 | g11 | CEC North American Env Policy | framework | 2 | 7 | 3 | 32 | epa.gov, canada.ca | COVERED |
| 48 | fc47cf4d | Kansas Register | directive | 2 | 7 | 5 | 27 | ksrevisor.gov, sos.ks.gov | COVERED |
| 49 | c3 | GRI Standards | standard | 2 | 6 | 0 | 0 | — | NOT-COVERED |
| 50 | 45f85547 | Washington Administrative Code (WAC) | framework | 2 | 7 | 5 | 51 | leg.wa.gov, lni.wa.gov, apps.leg.wa.gov | COVERED |
| 51 | 9e70b75b | Polish GIOŚ | framework | 2 | 7 | 5 | 27 | gios.gov.pl, nik.gov.pl, gov.pl, trade.gov | COVERED |
| 52 | b6b7eb7d | Japan MLIT Policy Document | regulation | 2 | 6 | 1 | 10 | mlit.go.jp | COVERED |
| 53 | 156ec17c | GRI Download Portal - Cookie Policy | standard | 2 | 7 | 0 | 0 | — | NOT-COVERED |
| 54 | bec305e1 | GHG Emissions Standards for HDV Phase 3 | regulation | 2 | 15 | 5 | 30 | epa.gov, gao.gov, federalregister.gov | COVERED |
| 55 | bfb6a9fe | IMO Air Pollution Prevention & Control Framework | guidance | 2 | 7 | 4 | 37 | imo.org, epa.gov | COVERED |
| 56 | 78b711f5 | Zero Emission Corridor Strategy | framework | 2 | 16 | 9 | 157 | driveelectric.gov, energy.gov, highways.dot.gov, fhwa.dot.gov | COVERED |
| 57 | 2a61e051 | EU OJ Legal Instrument L-2024-01610 | regulation | 2 | 7 | 5 | 52 | eur-lex.europa.eu, climate.ec.europa.eu, oeil.europarl.europa.eu | COVERED |
| 58 | 474ab4cd | Energy Efficiency (Private Rented Property) Regs 2015 | regulation | 2 | 7 | 4 | 47 | legislation.gov.uk, gov.uk | COVERED |
| 59 | 007f42b1 | TxDOT Freight Planning | framework | 2 | 10 | 5 | 39 | txdot.gov, transportation.gov | COVERED |
| 60 | eu_clean_trucking_2024_1610 | EU 2024/1610 HDV CO2 standards | regulation | 2 | 22 | 6 | 407 | eur-lex.europa.eu, climate.ec.europa.eu, europarl.europa.eu | COVERED |
| 61 | g14 | Mexico SEMARNAT | regulation | 2 | 7 | 1 | 14 | dof.gob.mx | COVERED |
| 62 | o9 | Norway Zero-Emission Shipping | regulation | 2 | 7 | 3 | 15 | sdir.no, regjeringen.no | COVERED |

Full item UUIDs are in the probe JSON (`fsi-app/scripts/tmp/db1-pool-coverage-62.json`) and in the
defer snapshot; short keys above are `legacy_id` or the UUID's first 8 chars.

## Reading

- **NOT-COVERED (9):** UAE hydrogen implementation decree, China Environmental Code, China carbon-market
  extension, GLEC a7/c5, SBTi c7, ASEAN g24, GRI c3, GRI cookie-policy portal item (156ec17c). These pools
  contain zero floor-qualifying rows — a paid re-ground over the stored pool cannot clear floor 2; they
  need fresh floor-source fetches (or, for the GRI cookie-policy artifact, archive as portal/error artifact
  rather than resynth).
- **PARTIAL (8):** floor host exists but text is thin (1–8KB) — g27, 6a8036a0 (CER), UAE net-zero roadmap,
  g15 Colombia, Australia EV strategy, 50ccd5cc (GLEC v3 news), Japan GX League, g19 South Korea MOF. A
  re-fetch of the identified floor URL (already in the pool) is the cheap completion path.
- **COVERED (45):** resynth at floor 2 is winnable from the stored pool alone; several are rich
  (eu_clean_trucking_2024_1610: 407KB of eur-lex text; Connecticut 172KB; EU HDV 171KB; ZEC 157KB).
