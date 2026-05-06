# Integrity-flag triage report

Generated: 2026-05-06T00:47:56.900Z

Source: integrity trigger from migration `035_agent_integrity_flags.sql`. Read-only triage — no DB writes.

## Totals

- total flagged-and-unresolved: **57**

| Issue | Count | Action default |
|---|---|---|
| (a) source-url-broken | 1 | replace_url / manual_review |
| (b) factual-gap | 3 | regenerate |
| (c) missing-regulation | 15 | insert_new_item |
| (d) stale-info | 0 | regenerate |
| (e) over-flag | 1 | clear_flag |
| (f) other | 37 | human_review |

## Cost estimate (worst case)

If every `regenerate`-class item is re-run via Claude API:

- regenerate-class items: **3**
- per-call estimate: $0.15
- **estimated total: $0.45**

## Patterns detected

- 15 flags identified missing regulations in jurisdiction `EU`.
- 55 flags share phrase "integrity rule" — review trigger sensitivity for that pattern.

## Per-item triage

| legacy_id | title | issue | action | auto-safe | rationale |
|---|---|---|---|---|---|
| `g14` | Mexico SEMARNAT | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: dof.gob.mx, brief len: 30634. |
| `g12` | ECLAC (UN Latin America) | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: cepal.org, brief len: 15337. |
| `262ac5f2` | Critical Minerals & EV Supply Chain | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: irena.org, brief len: 18335. |
| `g25` | DP World Sustainability | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: dpworld.com, brief len: 17428. |
| `r10` | Journal of Sustainable Transport | source-url-broken | `manual_review` | no | Source URL host "tandfonline.com" is non-canonical for a "replace the source url" flag, but no replacement URL found in the brief. |
| `g24` | ASEAN Transport Strategic Plan | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: asean.org, brief len: 18880. |
| `g15` | Colombian Ministry of Transport | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: mintransporte.gov.co, brief len: 11461. |
| `g17` | MPA Singapore Green Shipping | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: mpa.gov.sg, brief len: 16919. |
| `85525e8f` | Battery & Electric Vehicle Technology | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: iea.org, brief len: 16696. |
| `g18` | Japan MLIT | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: mlit.go.jp, brief len: 19491. |
| `14fea5cd` | Australia Regional Operations Profile | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: climatechangeauthority.gov.au, brief len: 20454. |
| `0980d468` | Crude Oil & Jet Fuel Price Intelligence | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: eia.gov, brief len: 14832. |
| `g7` | Germany BMDV | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: bundesregierung.de, brief len: 9269. |
| `g21` | ADB Sustainable Transport | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: adb.org, brief len: 17216. |
| `66835398` | Singapore Regional Operations Profile | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: mot.gov.sg, brief len: 17609. |
| `g10` | NREL Transportation | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: nrel.gov, brief len: 14889. |
| `r5` | Stockholm Environment Institute | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: sei.org, brief len: 7896. |
| `r3` | Fraunhofer IML | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/1542" which is not in intelligence_items. (+1 more candidates) |
| `10f26f54` | India Regional Operations Profile | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: transportpolicy.net, brief len: 22718. |
| `l4` | CER (European Railways) | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2019/1242" which is not in intelligence_items. (+1 more candidates) |
| `g1` | EU Fit for 55 Package | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/2405" which is not in intelligence_items. (+7 more candidates) |
| `r33` | Lloyd's Register Fleet Analytics | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: lr.org, brief len: 4409. |
| `r26` | E-Fuel Alliance | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/2405" which is not in intelligence_items. (+5 more candidates) |
| `r16` | Carbon Trust | factual-gap | `regenerate` | yes | Verification-class phrase "integrity rule" with canonical host find-and-update.company-information.service.gov.uk. Brief needs regen for mis |
| `r20` | JOC (Journal of Commerce) | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: joc.com, brief len: 7581. |
| `053123bc` | Brazil Regional Operations Profile | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: antt.gov.br, brief len: 21924. |
| `r7` | Erasmus Smart Port | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: erim.eur.nl, brief len: 9054. |
| `r29` | NREL Transportation R&D | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: nrel.gov, brief len: 10728. |
| `g5` | European Clean Trucking Alliance | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2024/1610" which is not in intelligence_items. (+2 more candidates) |
| `e77f9426` | United Kingdom Regional Operations Profile | missing-regulation | `insert_new_item` | no | Brief references "EU ETS" which is not in intelligence_items.  |
| `7169c9ac` | Autonomous & Connected Freight Technology | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: itf-oecd.org, brief len: 16369. |
| `r9` | Transportation Research Part E | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: sciencedirect.com, brief len: 4443. |
| `r4` | World Resources Institute | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: wri.org, brief len: 6924. |
| `r8` | Cranfield Sustainable Logistics | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: cranfield.ac.uk, brief len: 15054. |
| `f6774c49` | Hydrogen & Ammonia as Maritime Fuel | factual-gap | `regenerate` | yes | Verification-class phrase "integrity rule" with canonical host futurefuels.imo.org. Brief needs regen for missing facts. |
| `f67aabad` | NYC Local Law 97 — Building Carbon Emissions Caps | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: rules.cityofnewyork.us, brief len: 23945. |
| `a8` | Aviation Week: Sustainability | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/2405" which is not in intelligence_items. (+3 more candidates) |
| `afc851b1` | Marine Fuel Decarbonisation Pathways | factual-gap | `regenerate` | yes | Verification-class phrase "integrity rule" with canonical host imo.org. Brief needs regen for missing facts. |
| `r19` | Supply Chain Digital | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: supplychaindigital.com, brief len: 16019. |
| `r13` | GreenBiz Supply Chain | over-flag | `clear_flag` | yes | Matched phrase "if x was intended" appears in legitimate prose context, not as a self-flag. |
| `c8` | ISSB IFRS S2 | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/2405" which is not in intelligence_items. (+3 more candidates) |
| `o10` | ESPO (European Sea Ports Organisation) | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/1804" which is not in intelligence_items. (+1 more candidates) |
| `g26` | IRENA Abu Dhabi | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: irena.org, brief len: 9338. |
| `r36` | Maritime Carbon Intelligence | missing-regulation | `insert_new_item` | no | Brief references "EU ETS" which is not in intelligence_items.  |
| `t7` | GEF (Global Environment Facility) | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: fiftrustee.worldbank.org, brief len: 8321. |
| `5b8f3e8a` | Packaging Material Input Costs | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: fred.stlouisfed.org, brief len: 13113. |
| `g30` | World Bank Transport | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: ieg.worldbankgroup.org, brief len: 13491. |
| `o11` | Lloyd's Register Decarbonisation Hub | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: lrfoundation.org.uk, brief len: 13897. |
| `r11` | The Loadstar: Green Tech | missing-regulation | `insert_new_item` | no | Brief references "Directive (EU) 2023/959" which is not in intelligence_items. (+2 more candidates) |
| `d2b343b4` | Industrial Electricity Tariff Benchmarks by Jurisdiction | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: iea.org, brief len: 21997. |
| `r18` | Splash247 Green | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: splash247.com, brief len: 20064. |
| `t4` | UNCTAD Sustainable Transport | missing-regulation | `insert_new_item` | no | Brief references "EU ETS" which is not in intelligence_items.  |
| `r35` | ICCT | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: theicct.org, brief len: 14418. |
| `d031e36e` | LA EWEO — Existing Buildings Energy & Water Efficiency | other | `human_review` | no | Phrase "integrity rule" did not match any heuristic conclusively. Host: cityclerk.lacity.org, brief len: 18722. |
| `r15` | Environmental Finance | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/956" which is not in intelligence_items. (+5 more candidates) |
| `r14` | Reuters Sustainable Business | missing-regulation | `insert_new_item` | no | Brief references "Regulation (EU) 2023/956" which is not in intelligence_items. (+2 more candidates) |
| `t3` | OECD Environment | missing-regulation | `insert_new_item` | no | Brief references "EU ETS" which is not in intelligence_items.  |

## Items requiring human review

### `g14` — Mexico SEMARNAT

- source_url: https://www.dof.gob.mx/normasOficiales/9549/semarnat/semarnat.html
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: dof.gob.mx, brief len: 30634.

### `g12` — ECLAC (UN Latin America)

- source_url: https://www.cepal.org/en/publications/41229-freight-transport-road-tools-and-strategies-energy-efficiency-and-sustainability
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: cepal.org, brief len: 15337.

### `262ac5f2` — Critical Minerals & EV Supply Chain

- source_url: https://www.irena.org/Energy-Transition/Technology/Critical-materials
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: irena.org, brief len: 18335.

### `g25` — DP World Sustainability

- source_url: https://www.dpworld.com/en/sustainability/reporting
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: dpworld.com, brief len: 17428.

### `r10` — Journal of Sustainable Transport

- source_url: https://www.tandfonline.com/journals/ujst20
- phrase: "replace the source URL"
- reason: no_replacement_url_candidate_in_brief
- rationale: Source URL host "tandfonline.com" is non-canonical for a "replace the source url" flag, but no replacement URL found in the brief.

### `g24` — ASEAN Transport Strategic Plan

- source_url: https://asean.org/our-communities/economic-community/transport/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: asean.org, brief len: 18880.

### `g15` — Colombian Ministry of Transport

- source_url: https://mintransporte.gov.co/publicaciones/10754/transporte-sostenible/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: mintransporte.gov.co, brief len: 11461.

### `g17` — MPA Singapore Green Shipping

- source_url: https://www.mpa.gov.sg/media-centre/details/no.-12-of-2024---revisions-to-the-maritime-singapore-green-initiative---green-ship-programme-for-singapore-registered-ships
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: mpa.gov.sg, brief len: 16919.

### `85525e8f` — Battery & Electric Vehicle Technology

- source_url: https://www.iea.org/reports/global-ev-outlook-2024/trends-in-electric-vehicle-batteries
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: iea.org, brief len: 16696.

### `g18` — Japan MLIT

- source_url: https://www.mlit.go.jp/en/maritime/index.html
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: mlit.go.jp, brief len: 19491.

### `14fea5cd` — Australia Regional Operations Profile

- source_url: https://www.climatechangeauthority.gov.au/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: climatechangeauthority.gov.au, brief len: 20454.

### `0980d468` — Crude Oil & Jet Fuel Price Intelligence

- source_url: https://www.eia.gov/todayinenergy/prices.php
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: eia.gov, brief len: 14832.

### `g7` — Germany BMDV

- source_url: https://www.bundesregierung.de/breg-en/federal-government/ministries/federal-ministry-transport
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: bundesregierung.de, brief len: 9269.

### `g21` — ADB Sustainable Transport

- source_url: https://www.adb.org/sites/default/files/institutional-document/31315/sustainable-transport-initiative.pdf
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: adb.org, brief len: 17216.

### `66835398` — Singapore Regional Operations Profile

- source_url: https://www.mot.gov.sg/what-we-do/green-transport/maritime-environment-responsibility/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: mot.gov.sg, brief len: 17609.

### `g10` — NREL Transportation

- source_url: https://www.nrel.gov/transportation/research
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: nrel.gov, brief len: 14889.

### `r5` — Stockholm Environment Institute

- source_url: https://www.sei.org/about-sei/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: sei.org, brief len: 7896.

### `10f26f54` — India Regional Operations Profile

- source_url: https://www.transportpolicy.net/standard/india-regulatory-background/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: transportpolicy.net, brief len: 22718.

### `r33` — Lloyd's Register Fleet Analytics

- source_url: https://www.lr.org/en/sustainability/decarbonisation/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: lr.org, brief len: 4409.

### `r20` — JOC (Journal of Commerce)

- source_url: https://www.joc.com/about
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: joc.com, brief len: 7581.

### `053123bc` — Brazil Regional Operations Profile

- source_url: https://www.antt.gov.br
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: antt.gov.br, brief len: 21924.

### `r7` — Erasmus Smart Port

- source_url: https://www.erim.eur.nl/centres/smartporterasmus/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: erim.eur.nl, brief len: 9054.

### `r29` — NREL Transportation R&D

- source_url: https://www.nrel.gov/transportation/research
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: nrel.gov, brief len: 10728.

### `7169c9ac` — Autonomous & Connected Freight Technology

- source_url: https://www.itf-oecd.org/managing-transition-driverless-road-freight-transport
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: itf-oecd.org, brief len: 16369.

### `r9` — Transportation Research Part E

- source_url: https://www.sciencedirect.com/journal/transportation-research-part-e-logistics-and-transportation-review
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: sciencedirect.com, brief len: 4443.

### `r4` — World Resources Institute

- source_url: https://www.wri.org/research
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: wri.org, brief len: 6924.

### `r8` — Cranfield Sustainable Logistics

- source_url: https://www.cranfield.ac.uk/som/research-centres/centre-for-logistics-procurement-and-supply-chain-management/research-projects-current-and-past
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: cranfield.ac.uk, brief len: 15054.

### `f67aabad` — NYC Local Law 97 — Building Carbon Emissions Caps

- source_url: https://rules.cityofnewyork.us/rule/annual-greenhouse-gas-ghg-emissions-limits-for-buildings/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: rules.cityofnewyork.us, brief len: 23945.

### `r19` — Supply Chain Digital

- source_url: https://supplychaindigital.com/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: supplychaindigital.com, brief len: 16019.

### `g26` — IRENA Abu Dhabi

- source_url: https://www.irena.org/news/pressreleases/2012/Jun/IRENA-Headquarters-Agreement-signed-with-the-United-Arab-Emirates
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: irena.org, brief len: 9338.

### `t7` — GEF (Global Environment Facility)

- source_url: https://fiftrustee.worldbank.org/en/about/unit/dfi/fiftrustee/fund-detail/gef
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: fiftrustee.worldbank.org, brief len: 8321.

### `5b8f3e8a` — Packaging Material Input Costs

- source_url: https://fred.stlouisfed.org/series/WPU066
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: fred.stlouisfed.org, brief len: 13113.

### `g30` — World Bank Transport

- source_url: https://ieg.worldbankgroup.org/topic/transport
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: ieg.worldbankgroup.org, brief len: 13491.

### `o11` — Lloyd's Register Decarbonisation Hub

- source_url: https://www.lrfoundation.org.uk/programmes/lloyds-register-maritime-decarbonisation-hub
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: lrfoundation.org.uk, brief len: 13897.

### `d2b343b4` — Industrial Electricity Tariff Benchmarks by Jurisdiction

- source_url: https://www.iea.org/data-and-statistics/data-product/energy-prices
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: iea.org, brief len: 21997.

### `r18` — Splash247 Green

- source_url: https://splash247.com/category/sector/environment/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: splash247.com, brief len: 20064.

### `r35` — ICCT

- source_url: https://theicct.org/
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: theicct.org, brief len: 14418.

### `d031e36e` — LA EWEO — Existing Buildings Energy & Water Efficiency

- source_url: https://cityclerk.lacity.org/onlinedocs/2014/14-1478_misc_10-06-2016.pdf
- phrase: "integrity rule"
- reason: no_heuristic_matched
- rationale: Phrase "integrity rule" did not match any heuristic conclusively. Host: cityclerk.lacity.org, brief len: 18722.

## Proposed new intelligence_items rows

| Source flag | Proposed title | jurisdiction | source_url | item_type |
|---|---|---|---|---|
| `r3` | Regulation (EU) 2023/1542 | EU | https://eur-lex.europa.eu/eli/reg/2023/1542/oj | regulation |
| `l4` | Regulation (EU) 2019/1242 | EU | https://eur-lex.europa.eu/eli/reg/2019/1242/oj | regulation |
| `g1` | Regulation (EU) 2023/2405 | EU | https://eur-lex.europa.eu/eli/reg/2023/2405/oj | regulation |
| `r26` | Regulation (EU) 2023/2405 | EU | https://eur-lex.europa.eu/eli/reg/2023/2405/oj | regulation |
| `g5` | Regulation (EU) 2024/1610 | EU | https://eur-lex.europa.eu/eli/reg/2024/1610/oj | regulation |
| `e77f9426` | EU ETS | EU | https://eur-lex.europa.eu/ | regulation |
| `a8` | Regulation (EU) 2023/2405 | EU | https://eur-lex.europa.eu/eli/reg/2023/2405/oj | regulation |
| `c8` | Regulation (EU) 2023/2405 | EU | https://eur-lex.europa.eu/eli/reg/2023/2405/oj | regulation |
| `o10` | Regulation (EU) 2023/1804 | EU | https://eur-lex.europa.eu/eli/reg/2023/1804/oj | regulation |
| `r36` | EU ETS | EU | https://eur-lex.europa.eu/ | regulation |
| `r11` | Directive (EU) 2023/959 | EU | https://eur-lex.europa.eu/eli/dir/2023/959/oj | regulation |
| `t4` | EU ETS | EU | https://eur-lex.europa.eu/ | regulation |
| `r15` | Regulation (EU) 2023/956 | EU | https://eur-lex.europa.eu/eli/reg/2023/956/oj | regulation |
| `r14` | Regulation (EU) 2023/956 | EU | https://eur-lex.europa.eu/eli/reg/2023/956/oj | regulation |
| `t3` | EU ETS | EU | https://eur-lex.europa.eu/ | regulation |

---

Machine-readable plan: `docs/INTEGRITY-TRIAGE-PLAN.json`
Procedure: `docs/INTEGRITY-TRIAGE-PROCEDURE.md`
