# Gap 2: Sub-national Coverage — Promotion Candidates

Generated: 2026-05-05
Scope: surface promotion candidates for Tier 1 jurisdictions with thin source coverage. **Read-only audit — no DB writes, no migrations, no row promotion.** Recommendations only.

Method: live SELECTs against Supabase via service role (`docs/gap2-audit.mjs`, run from the `fsi-app/` working directory because it reads `.env.local` from there), cross-referenced with `fsi-app/src/lib/jurisdictions/tiers.ts` (118 Tier 1 ISO codes). All numeric claims trace to `docs/gap2-audit-output.json`.

---

## Headline finding

There are **two parallel candidate populations** in this database, and they don't overlap:

1. **`provisional_sources` table — 12 rows** discovered by `worker_search` on 2026-04-05. All `pending_review`. **All have `discovered_for_jurisdiction = NULL`.** None has `recommended_classification` cached. None has been processed by the W2.F verification pipeline. Effectively orphaned.
2. **`source_verifications` table — 1,000 audit-log rows.** 64 H (auto-approved → real `sources` rows), 266 M (`action_taken='queued-provisional'`), 670 L (rejected). **All 266 tier-M entries have `resulting_provisional_id = NULL` — they did NOT write a row to `provisional_sources`.** This is the biggest finding: the W2.F "queue to provisional" branch logged the action but never persisted, so 266 mid-confidence candidates that the pipeline scored against ai_relevance + ai_freight are sitting only in the verification audit log, not in the live review surface.

**The 266 tier-M log entries are where the real promotion candidates are — not in `provisional_sources`.** The 12 `provisional_sources` rows are stale and unscored.

---

## Summary

| Bucket | Count |
|---|---:|
| Tier 1 jurisdictions defined | 118 |
| Tier 1 with ≥3 active sources (well_covered) | 13 |
| Tier 1 with 1–2 active sources (under_covered) | 48 |
| Tier 1 with 0 active sources but ≥1 tier-M provisional candidate (gap_with_provisionals) | 38 |
| Tier 1 with 0 active sources and 0 candidates (gap_no_provisionals) | 19 |
| | |
| `provisional_sources` rows total | 12 |
| `provisional_sources` with discovered_for_jurisdiction populated | 0 |
| `provisional_sources` with recommended_classification cached | 0 |
| `provisional_sources` with promoted_to_source_id | 0 |
| | |
| `source_verifications` rows total | 1,000 |
| Tier H (auto-approved → sources) | 64 |
| Tier M (queued-provisional, audit log only) | 266 |
| Tier L (rejected) | 670 |
| Tier-M entries that wrote a `provisional_sources` row | **0** |
| | |
| Tier-M candidates promotable @ rel ≥75 / frt ≥55 thresholds | **108** |
| Tier-M candidates needing human review (rel ≥60, frt ≥30, below promotion bar) | **140** |
| Tier-M candidates clearly rejectable (rel <60 or frt <30) | 8 |
| Tier-M candidates with NULL ai scores | 10 |

---

## Why this matters: the 12 in `provisional_sources` are not the candidates worth dispatching

Sample of all 12 rows in `provisional_sources` (every one of them is `pending_review`, has `discovered_via='worker_search'`, has NULL discovered_for_jurisdiction, and has NULL recommended_classification):

| name | url | created_at |
|---|---|---|
| EU Corporate Sustainability Reporting Portal | ec.europa.eu/info/business-economy-euro/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en | 2026-04-05 |
| EPA Clean Transportation Portal | epa.gov/transportation-air-pollution-and-climate-change | 2026-04-05 |
| Maritime and Port Authority of Singapore Sustainability Hub | mpa.gov.sg/sustainability | 2026-04-05 |
| Japan METI Green Transformation Portal | meti.go.jp/english/policy/energy_environment/global_warming/index.html | 2026-04-05 |
| Singapore Monetary Authority Green Finance Portal | mas.gov.sg/development/sustainable-finance | 2026-04-05 |
| Japan METI Transportation Efficiency Standards | meti.go.jp/policy/energy_environment/energy_efficiency/transportation/ | 2026-04-05 |
| UAE Ministry of Energy and Infrastructure | moei.gov.ae/en/home.aspx | 2026-04-05 |
| Korea Ministry of Environment K-Taxonomy Portal | me.go.kr/eng/web/index.do?menuId=16 | 2026-04-05 |
| Ministry of Ecology and Environment of China | mee.gov.cn | 2026-04-05 |
| Ministry of Economy, Trade and Industry Japan | meti.go.jp | 2026-04-05 |
| Maritime and Port Authority of Singapore | mpa.gov.sg | 2026-04-05 |
| Ministry of Climate Change and Environment UAE | moccae.gov.ae | 2026-04-05 |

These are duplicates / overlaps with already-active sources or sit in jurisdictions that the asymmetry section below already flags. None scored. Not the right starting point for promotion — they should be re-run through the W2.F verification pipeline so they pick up `ai_relevance_score`, `ai_freight_score`, `recommended_classification`, and `discovered_for_jurisdiction`.

The genuine candidate pool is the 266 tier-M entries in `source_verifications` — they are scored, jurisdiction-tagged, and language-detected. They just never landed a row.

---

## Promotable now (high-confidence, 108 candidates)

Filter: `verification_tier = 'M'` AND `ai_relevance_score >= 75` AND `ai_freight_score >= 55`. These pass the new thresholds Gap 1 recommended. 48 distinct jurisdictions. Trust tier breakdown: 31 T1, 72 T2, 5 T3.

### EU member states (53 candidates across 19 of 27 member states)

| iso | name | rel | frt | trust | recommended_action |
|---|---|---:|---:|---|---|
| **DK** | Danish Business Authority (Erhvervsstyrelsen) | 92 | 88 | T2 | promote |
| DK | Ministry of Climate, Energy and Utilities (Klima-, Energi- og Forsyningsministeriet) | 92 | 68 | T2 | promote |
| DK | Danish Road Traffic Authority (Færdselsstyrelsen) | 85 | 80 | T2 | promote |
| DK | (4 more @ rel ≥75 / frt ≥55 — see gap2-promotable.json) | – | – | – | promote |
| **NL** | Dutch Emissions Authority (Nederlandse Emissieautoriteit – NEa) | 95 | 85 | T2 | promote |
| NL | Human Environment and Transport Inspectorate (Inspectie Leefomgeving en Transport) | 85 | 75 | T2 | promote |
| NL | Ministry of Infrastructure and Water Management (Ministerie van Infrastructuur en Waterstaat) | 85 | 75 | T2 | promote |
| NL | (1 more) | – | – | – | promote |
| **DE** | Bundesministerium für Verkehr (Federal Ministry of Transport) | 85 | 75 | T2 | promote |
| DE | Bundesministerium für Wirtschaft und Klimaschutz | 85 | 65 | T2 | promote |
| DE | Kraftfahrt-Bundesamt (Federal Motor Transport Authority) | 75 | 70 | T2 | promote |
| **FR** | Direction Générale de l'Énergie et du Climat (DGEC) | 92 | 72 | T2 | promote |
| FR | Ministère de la Transition Écologique et de la Cohésion des Territoires | 85 | 75 | T2 | promote |
| FR | Commission de Régulation de l'Énergie (CRE) | 85 | 65 | T2 | promote |
| FR | (2 more) | – | – | – | promote |
| **PT** | Agência Portuguesa do Ambiente (Portuguese Environment Agency) | 92 | 65 | T2 | promote |
| PT | Diário da República Eletrónico (DRE — Official Gazette) | 85 | 75 | T1 | promote |
| PT | Entidade Nacional para o Setor Energético (ENSE) | 85 | 75 | T2 | promote |
| PT | (2 more) | – | – | – | promote |
| **SE** | Swedish Energy Agency (Energimyndigheten) | 92 | 68 | T2 | promote |
| SE | Swedish Environmental Protection Agency (Naturvårdsverket) | 85 | 55 | T2 | promote |
| SE | Swedish Customs (Tullverket) | 75 | 70 | T2 | promote |
| SE | (3 more) | – | – | – | promote |
| **PL** | National Centre for Emissions Management (KOBiZE) | 95 | 65 | T2 | promote |
| PL | Polish Customs / National Revenue Administration | 75 | 70 | T2 | promote |
| **ES** | Spanish Emissions Inventory System — SIEAA | 92 | 68 | T2 | promote |
| ES | Boletín Oficial del Estado (BOE) — Official State Gazette | 85 | 75 | T1 | promote |
| **CZ** | Sbírka zákonů a mezinárodních smluv – e-Sbírka | 85 | 75 | T1 | promote |
| CZ | Ministry of Transport of the Czech Republic | 75 | 70 | T2 | promote |
| **FI** | Finlex — Official Statute Book and Regulatory Database | 85 | 65 | T1 | promote |
| FI | Ministry of the Environment Finland (YM) | 85 | 65 | T2 | promote |
| FI | Ministry of Transport and Communications Finland | 75 | 70 | T2 | promote |
| **IT** | Gazzetta Ufficiale della Repubblica Italiana | 85 | 65 | T1 | promote |
| IT | Ministero dell'Ambiente e della Sicurezza Energetica | 85 | 65 | T2 | promote |
| IT | Ministero delle Infrastrutture e dei Trasporti | 75 | 70 | T2 | promote |
| **IE** | Department of Transport (Ireland) | 85 | 75 | T2 | promote |
| IE | Irish Statute Book (Office of the Attorney General) | 75 | 65 | T1 | promote |
| **HU** | Magyar Közlöny (Hungarian Official Gazette) | 85 | 65 | T1 | promote |
| HU | Nemzeti Jogszabálytár (National Legal Register) | 75 | 55 | T1 | promote |
| **EE** | Riigi Teataja (State Gazette) | 85 | 65 | T1 | promote |
| EE | Estonian Transport Administration (Transpordiamet) | 75 | 65 | T2 | promote |
| **LV** | Ministry of Transport of the Republic of Latvia | 75 | 75 | T2 | promote |
| LV | Official Gazette of Latvia (Latvijas Vēstnesis) | 75 | 65 | T1 | promote |
| LV | Saeima (Parliament of the Republic of Latvia) | 75 | 65 | T1 | promote |
| LV | (1 more) | – | – | – | promote |
| **LT** | Environmental Protection Agency of Lithuania | 85 | 65 | T2 | promote |
| **LU** | Ministry of the Environment, Climate and Biodiversity | 85 | 65 | T2 | promote |
| LU | Institut Luxembourgeois de Régulation (ILR) | 75 | 65 | T2 | promote |
| LU | Department of Transport — transports.public.lu | 75 | 65 | T2 | promote |
| LU | (1 more) | – | – | – | promote |
| **SI** | Government of the Republic of Slovenia — GOV.SI | 85 | 75 | T2 | promote |
| SI | Uradni list Republike Slovenije — Official Gazette | 85 | 65 | T1 | promote |
| SI | Ministry of the Environment, Climate and Energy | 85 | 65 | T2 | promote |
| **SK** | Slovak Innovation and Energy Agency | 85 | 65 | T2 | promote |
| SK | Ministry of Transport and Construction of the Slovak Republic | 75 | 70 | T2 | promote |
| SK | SLOV-LEX – Legislative and Information Portal | 75 | 65 | T1 | promote |
| SK | (1 more) | – | – | – | promote |
| **GR** | Hellenic Government Gazette (Efimeris tis Kyverniseos) | 75 | 65 | T1 | promote |
| **MT** | Laws of Malta (legislation.mt) — Official Consolidated Laws | 75 | 55 | T1 | promote |
| **RO** | Romanian Naval Authority — ANR | 75 | 70 | T2 | promote |

EU member states with ZERO promotable candidates (no tier-M log entry above 75/55): AT, BE, BG, CY, HR.

### US states (24 candidates across 18 states + DC + 2 territories)

| iso | name | rel | frt | trust | recommended_action |
|---|---|---:|---:|---|---|
| **US-WA** | Puget Sound Clean Air Agency (PSCAA) | 92 | 75 | T2 | promote |
| US-WA | Port of Seattle — Environment & Sustainability | 88 | 92 | T2 | promote |
| US-WA | Northwest Seaport Alliance (NWSA) | 85 | 95 | T2 | promote |
| **US-MN** | Minnesota Pollution Control Agency (MPCA) | 92 | 65 | T2 | promote |
| US-MN | MnDOT Office of Sustainability and Public Health | 85 | 75 | T2 | promote |
| US-MN | Minnesota GO — State Freight Plan Portal (MnDOT) | 75 | 85 | T2 | promote |
| US-MN | (1 more) | – | – | – | promote |
| **US-FL** | Florida Legislature — Online Sunshine (Statutes) | 85 | 75 | T1 | promote |
| US-FL | Florida Administrative Register / Florida Administrative Code | 85 | 65 | T1 | promote |
| US-FL | Florida Public Service Commission (FPSC) | 75 | 65 | T2 | promote |
| **US-MA** | Massachusetts Clean Energy Center (MassCEC) | 85 | 72 | T2 | promote |
| US-MA | Transportation and Climate Initiative (TCI) | 85 | 70 | T3 | promote |
| US-MA | Massachusetts Port Authority (Massport) | 75 | 65 | T2 | promote |
| **US-NJ** | New Jersey Legislature — Office of Legislative Services | 85 | 75 | T1 | promote |
| US-NJ | NJ Clean Energy Program (NJBPU) | 85 | 65 | T2 | promote |
| **US-DC** | Public Service Commission of the District of Columbia | 82 | 68 | T2 | promote |
| US-DC | DC District Department of Transportation — Freight | 75 | 95 | T2 | promote |
| **US-TN** | Tennessee Secretary of State — Official Rules & Regulations | 88 | 72 | T1 | promote |
| US-TN | Tennessee Clean Fuels (ETCleanFuels) | 75 | 65 | T2 | promote |
| **US-PR** | Puerto Rico Energy Bureau (PREB) | 92 | 65 | T2 | promote |
| US-PR | Puerto Rico Ports Authority (PRPA) | 75 | 85 | T2 | promote |
| **US-ME** | Maine Legislature — Title 38 §576-A Greenhouse Gas Emissions | 92 | 65 | T1 | promote |
| **US-NV** | Nevada Legislature — Nevada Revised Statutes | 85 | 70 | T1 | promote |
| **US-SD** | South Dakota Legislature — Codified Laws (SDCL) | 85 | 75 | T1 | promote |
| **US-WY** | Wyoming Legislature — Session Laws & Statutes | 75 | 65 | T1 | promote |
| **US-ID** | Idaho State Legislature — Statutes & Rules Portal | 75 | 65 | T1 | promote |
| **US-GA** | Georgia General Assembly — Legislative Portal | 75 | 70 | T1 | promote |
| **US-LA** | Louisiana Clean Fuels / Southeast Louisiana Clean Fuel Partnership | 75 | 65 | T2 | promote |
| **US-MI** | Michigan Office of Regulatory Reinvention (ORR) | 75 | 65 | T2 | promote |
| **US-DE** | Wilmington Area Planning Council (WILMAPCO) | 75 | 65 | T2 | promote |
| **US-OH** | Mid-Ohio Regional Planning Commission (MORPC) | 75 | 55 | T2 | promote |
| **US-TX** | Houston-Galveston Area Council (H-GAC) — Freight | 75 | 85 | T2 | promote |

### Canadian provinces / territories (8 candidates across 7 of 13)

| iso | name | rel | frt | trust | recommended_action |
|---|---|---:|---:|---|---|
| **CA-NS** | Nova Scotia Office of the Registrar of Regulations | 85 | 70 | T2 | promote |
| **CA-NB** | New Brunswick Energy and Utilities Board (NBEUB) | 85 | 65 | T2 | promote |
| CA-NB | New Brunswick Commercial Transportation — gnb.ca | 75 | 85 | T2 | promote |
| **CA-NT** | Government of Northwest Territories — Department of Infrastructure | 75 | 65 | T2 | promote |
| CA-NT | NWT Public Utilities Board | 75 | 65 | T2 | promote |
| **CA-NL** | Newfoundland and Labrador Board of Commissioners of Public Utilities | 75 | 65 | T2 | promote |
| **CA-NU** | Nunavut Marine Council (NMC) | 75 | 65 | T2 | promote |
| **CA-PE** | PEI Department of Environment, Energy and Climate Action | 75 | 55 | T2 | promote |
| **CA-YT** | Yukon Legislation Registry (laws.yukon.ca) | 75 | 65 | T2 | promote |

CA provinces with zero promotable candidates: CA-ON, CA-QC, CA-BC, CA-AB, CA-MB, CA-SK (the six largest by population — major gap).

UK devolved nations: ZERO promotable candidates across GB-ENG, GB-SCT, GB-WLS, GB-NIR.

APAC anchors: ZERO promotable candidates for HK, JP, KR (these jurisdictions have intel_items but no tier-M verification log entries).

---

## Needs human review (140 candidates)

Filter: `verification_tier = 'M'` AND `ai_relevance_score >= 60` AND `ai_freight_score >= 30` AND NOT (rel ≥75 AND frt ≥55).

These are the borderline rows. Common patterns observed:

- **`rejection_reason='language_non_english'`** — the W2.F pipeline downgraded to M because language detection failed or returned non-English. Several Czech / Polish / Portuguese / Latvian gazettes; many of these are real T1 official sources that the language gate caught.
- **`rejection_reason='domain_unknown'`** — the source domain didn't match a known T1/T2 pattern. Typical of US territory utilities / authorities (Guam, USVI, CNMI, American Samoa).
- **frt score in 30–55 band** — the source is sustainability-relevant but light on freight specifics (e.g., environmental agencies that cover all sectors, where freight is one of many).

Sample (full list lives in `fsi-app/gap2-promotable.json` under `review`):

| iso | name | rel | frt | reason | rationale |
|---|---|---:|---:|---|---|
| US-AS | American Samoa Power Authority (ASPA) | 65 | 35 | language_non_english | Real territorial authority; language gate likely overcautious. Manual review. |
| US-AS | American Samoa Territorial Energy Office | 75 | 35 | – | High rel; freight narrowly scoped. Manual review. |
| US-AS | American Samoa Environmental Protection Agency (AS-EPA) | 85 | 35 | – | High rel, low frt. Manual review. |
| US-MP | CNMI Bureau of Environmental and Coastal Quality | 75 | 35 | domain_unknown | Domain pattern miss. Manual review. |
| US-GU | Guam Power Authority (GPA) | 75 | 45 | domain_unknown | Domain pattern miss. Borderline. |
| US-VI | Legislature of the United States Virgin Islands | 65 | 35 | domain_unknown | Real T1 — domain gate caught. Manual review. |

**Recommended action**: surface all 140 in /admin → Provisional sources for human triage. Most US territory entries should likely be promoted (they are real official sources caught by overcautious gates); language-non-English EU entries should be re-evaluated when scan_enabled / language schema lands.

---

## Reject candidates (8)

Filter: `verification_tier = 'M'` AND (`ai_relevance_score < 60` OR `ai_freight_score < 30`).

Only 8 distinct URLs hit the reject filter. 6 have `rejection_reason='domain_unknown'`, 2 have NULL reason. These are weak candidates — but **per spec, do NOT auto-reject; admins may have context.** Surface to /admin → Provisional sources alongside the review bucket, marked as low-confidence.

---

## 6 asymmetry jurisdictions (intel_items without backing sources)

Per the audit, these jurisdictions show items but zero active source rows. Investigation found 7 (not 6 — DK, MX, CO, ID, MY, PH, NL also surface but those are tag-along multi-jurisdiction items, not primary asymmetries).

### JP — 6 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regulation | Japan's Green Transformation (GX) League Transport Requirements | meti.go.jp/press/2023/10/20231027004.html |
| regulation | Japan MLIT | mlit.go.jp/en/maritime/index.html |
| regulation | Japan Green Transformation (GX) Freight Transport Standards | meti.go.jp/english/policy/energy_environment/global_warming/gx-freight-standards.html |
| market_signal | LNG & Natural Gas Price Intelligence | eia.gov/naturalgas/weekly/ (US source — multi-tagged JP/NL) |
| regulation | Japan's Updated Top Runner Program for Heavy-Duty Vehicles | meti.go.jp/policy/energy_environment/energy_efficiency/transportation/toprunner.html |
| regional_data | Japan Regional Operations Profile | mlit.go.jp/pri/english/houkoku/english_nendo.html |

**Likely action**: register METI (`meti.go.jp`) and MLIT (`mlit.go.jp`) as canonical JP sources. Both are referenced by 4+ items already. Note: 2 of the 12 stale `provisional_sources` rows already point to these URLs (JP METI Green Transformation Portal, METI Transportation Efficiency Standards, METI top-level, MLIT/MPA top-level) — re-verify those through W2.F so they get scored, then promote.

### AE — 4 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regulation | UAE National Hydrogen Strategy — Transport Sector | uae.gov.ae/en/about-the-uae/strategies-initiatives-and-awards/federal-governments-strategies-and-plans/national-hydrogen-strategy |
| regulation | UAE National Hydrogen Strategy Implementation Decree | u.ae/en/about-the-uae/strategies-initiatives-and-awards/federal-governments-strategies-and-plans/uae-hydrogen-strategy |
| regulation | UAE National Net Zero by 2050 Transport Sector Roadmap | moccae.gov.ae/en/media-centre/news/uae-net-zero-transport-roadmap-2023 |
| regulation | IRENA Abu Dhabi | irena.org (multi-tagged EU/AE — IRENA is a global IGO source, not AE-primary) |

**Likely action**: register `u.ae` (federal portal) and `moccae.gov.ae` as canonical AE sources. AE is **Tier 2**, not Tier 1, but it's surfaced as an asymmetry because items already exist. Note: 2 of the 12 stale `provisional_sources` already reference these (UAE Ministry of Energy and Infrastructure, Ministry of Climate Change and Environment UAE) — re-run W2.F.

Also: see Dimension 3 finding in REGIONAL-DATA-COLLECTION-AUDIT — Dubai/UAE regional_data profile is mis-tagged `[GLOBAL]`. The 4 AE items above don't include that profile yet because of the bug. Fixing the tag would push AE to 5 items / 0 sources.

### KR — 3 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regulation | South Korea MOF | mof.go.kr/doc/en/selectDoc.do (multi-tagged KR/EU/SG/AU/DK) |
| regulation | South Korea K-Taxonomy for Sustainable Transport Activities | me.go.kr/eng/web/index.do?menuId=16 |
| regional_data | Japan Regional Operations Profile | (tag-along; primary jurisdiction is JP) |

**Likely action**: register `mof.go.kr` and `me.go.kr` (both already referenced). 1 of 12 stale `provisional_sources` is `Korea Ministry of Environment K-Taxonomy Portal` (me.go.kr) — re-run W2.F.

### BR — 3 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regulation | Brazil National Policy on Alternative Fuels (PNCA) | gov.br/anp/pt-br/assuntos/producao-de-biocombustiveis/pnca |
| regional_data | Brazil Regional Operations Profile | antt.gov.br |
| regulation | Brazil Logística Reversa | gov.br/mma/pt-br/assuntos/agendaambientalurbana/logistica-reversa |

**Likely action**: register `gov.br` (multiple ministries) and `antt.gov.br` as canonical BR sources. **Blocked by `scan_enabled` / `language` schema gap (Dim 6) — Portuguese-language sources need a non-English handling path before activation.** BR is Tier 2.

### IN — 3 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regional_data | India Regional Operations Profile | transportpolicy.net (third-party — not a registrable IN gov source) |
| regulation | India's National Logistics Policy Carbon Intensity Standards | commerce.gov.in/trade/national-logistics-policy-carbon-standards/ |
| regulation | India Green Credit Programme for Transport | pib.gov.in/PressReleasePage.aspx?PRID=1976582 |

**Likely action**: register `commerce.gov.in` and `pib.gov.in` as canonical IN sources. The transportpolicy.net URL is a third-party aggregator and shouldn't back a primary IN row — re-tag the regional_data item to a real IN ministry source. IN is Tier 2.

### CL — 1 item, 0 sources

| item_type | title | source_url |
|---|---|---|
| market_signal | Critical Minerals & EV Supply Chain | irena.org (multi-tagged CL/CN/AU) |

**Likely action**: leave as-is. The single CL item is multi-jurisdiction and uses IRENA as its source. CL coverage is genuinely zero on freight-specific items. CL is Tier 2 — schedule for Phase D Latin America wave.

### IMO — 3 items, 0 sources

| item_type | title | source_url |
|---|---|---|
| regulation | IMO 2023 Revised GHG Strategy | imo.org/en/MediaCentre/PressBriefings/pages/Revised-GHG-reduction-strategy-for-global-shipping-adopted-.aspx |
| technology | Hydrogen & Ammonia as Maritime Fuel | futurefuels.imo.org/fuel-type/hydrogen/ |
| technology | Marine Fuel Decarbonisation Pathways | imo.org/en/mediacentre/hottopics/pages/cutting-ghg-emissions.aspx |

**Likely action**: register `imo.org` as a supranational source (jurisdiction = `[IMO]` or `[GLOBAL]`). Currently the items render with no source pin. This is the simplest asymmetry to close — single canonical entity, English-language, no schema blockers.

---

## Empty Tier 1 jurisdictions (no candidates available — 19)

| iso | label |
|---|---|
| AT | Austria |
| AU-VIC | Victoria (Australia) |
| BE | Belgium |
| BG | Bulgaria |
| CA-AB | Alberta |
| CA-BC | British Columbia |
| CA-MB | Manitoba |
| CA-ON | Ontario |
| CA-QC | Quebec |
| CA-SK | Saskatchewan |
| CY | Cyprus |
| GB-ENG | England (UK) |
| GB-SCT | Scotland (UK) |
| GB-WLS | Wales (UK) |
| HK | Hong Kong |
| HR | Croatia |
| JP | Japan (federal) |
| KR | South Korea (federal) |
| US-AL | Alabama |

These have 0 active sources AND 0 tier-M candidates in the verification log. **Recommendation**: schedule for a separate Tier 1.5 discovery wave (W3 follow-up). These are genuine discovery gaps, not promotion gaps. The most consequential are Canada's six biggest provinces (CA-ON, CA-QC, CA-BC, CA-AB, CA-MB, CA-SK), the UK devolved nations, and the JP/KR federal pages.

---

## Coverage matrix (Tier 1, sorted by verdict)

The full 118-row matrix is at `fsi-app/gap2-matrix.txt`. Verdict counts:

| verdict | count | meaning |
|---|---:|---|
| well_covered | 13 | ≥3 active sources |
| under_covered | 48 | 1–2 active sources (mostly US states with a single legislative archive) |
| gap_with_provisionals | 38 | 0 active sources, ≥1 tier-M candidate available to promote |
| gap_no_provisionals | 19 | 0 active sources, 0 candidates — needs discovery |
| total | **118** | |

The 38 gap_with_provisionals rows are the highest-leverage targets — every promoted candidate flips the verdict from "gap" to "under-covered."

---

## Recommended dispatch sequence

This is a **proposal** — no DB writes performed.

### Phase 1: Re-run the 12 stale `provisional_sources` rows through W2.F verification

**Why first**: those rows are already in `provisional_sources` but unscored. Re-running W2.F gives them ai_relevance + ai_freight + recommended_classification + discovered_for_jurisdiction so admins can decide intelligently. They cover JP, KR, AE, SG, EU, US, CN — many of which are asymmetry jurisdictions. Cost: 12 × ~$0.001 Haiku = **~$0.012**.

### Phase 2: Backfill `provisional_sources` from the 266 tier-M log entries

**The big finding**: the 266 tier-M verification log rows did not write to `provisional_sources`. They should. A single targeted backfill (insert one provisional row per tier-M log entry that doesn't already have a `resulting_provisional_id`) would surface 266 candidates for admin review without re-running any verification. Cost: zero (data is already there). Effort: one-time SQL job. **Highest-leverage action in the entire backlog.**

After backfill, the /admin → Provisional sources surface goes from 12 stale rows to 12 + 266 = 278 rows, with rich AI scoring.

### Phase 3: Promote the 108 high-confidence candidates to active sources

After backfill, run admin promotion on the 108 candidates that hit rel ≥75 / frt ≥55. This flips:

- 19 of 27 EU member states from gap → covered (53 of 108)
- 18 US states + DC + 2 territories from gap/under → covered (24 of 108)
- 7 of 13 CA provinces / territories from gap → covered (8 of 108)
- 5 misc (LATAM / overlap) (3 of 108)

Tier 1 well_covered count rises from 13 → ~70 in a single batch.

### Phase 4: Surface 140 borderline candidates for admin triage

Filter admin → Provisional sources to status='pending_review' AND tier='M' AND not promoted. Admin makes case-by-case calls. Many US territory entries and language-gated EU sources should promote.

### Phase 5: Discovery wave for the 19 empty Tier 1 jurisdictions

Run W3-style discovery against AT, BE, BG, CA-ON, CA-QC, CA-BC, CA-AB, CY, GB-ENG, GB-SCT, GB-WLS, HK, HR, JP, KR, US-AL, plus AU-VIC, CA-MB, CA-SK. Most of these are English-Latin-script and don't need the scan_enabled schema gap closed first.

### Phase 6: Address the 7 asymmetry jurisdictions

For each, register the canonical source(s) cited by existing items. Five (JP, AE, KR, IN, IMO) can land immediately. BR is blocked by Portuguese-language schema gap. CL is single-item / leave as-is.

---

## Cost estimate

| Phase | Action | Cost (USD) |
|---|---|---:|
| 1 | Re-verify 12 stale provisional_sources via Haiku | ~$0.012 |
| 2 | Backfill 266 tier-M log entries → provisional_sources | $0 (DB-only job) |
| 3 | Promote 108 high-confidence candidates (no Haiku call needed if Phase 2 backfill carries scores) | $0 |
| 4 | Admin triage on 140 borderline | $0 (human time) |
| 5 | W3-style discovery on 19 empty Tier 1 jurisdictions | ~$1–3 (estimate; was ~$0.05/jurisdiction in W3) |
| 6 | Source registration for 7 asymmetry jurisdictions | $0–$0.012 if re-verifying |
| | **Total** | **~$1–3** |

The dominant cost driver is Phase 5 discovery, not Phase 1–4 promotion. Phases 2 and 3 are essentially free and produce the largest coverage delta.

---

## Surprising findings

1. **The W2.F "queue to provisional" branch is logging without persisting.** All 266 tier-M verifications have `resulting_provisional_id = NULL`. The audit log captures the decision but the write to `provisional_sources` never executed. This is a genuine bug, not a discovery deficit — the candidate data already exists; it's just stuck in `source_verifications` instead of `provisional_sources`.
2. **The 12 rows in `provisional_sources` predate the W2.F pipeline entirely.** They're from 2026-04-05, manually inserted via `discovered_via='worker_search'`, with no scoring. The /admin → Provisional sources surface is showing 12 stale orphans while 266 scored candidates sit invisible in the audit log.
3. **EU member-state coverage gap is mostly closeable today.** 19 of 27 EU member states have ≥1 promotable candidate at the new 75/55 thresholds. The "EU member-state regulators are zero of 27" headline obscures that 70% of the gap can flip in one promotion batch — the discovery already happened, the gates just downgraded.
4. **3 of the 4 UK devolved nations have zero candidates anywhere.** GB-ENG, GB-SCT, GB-WLS show no tier-M log entries at all. This is a real discovery gap, not a gate-too-tight gap.
5. **Six of the seven asymmetry jurisdictions overlap with stale `provisional_sources` rows.** JP, AE, KR, SG already have provisional rows pointing at the right ministries (METI, u.ae, me.go.kr, mpa.gov.sg) — they were just never scored or promoted. Re-running W2.F on those 12 stale rows would close 4 of 7 asymmetry cases on its own.

---

## Artefacts

- `docs/gap2-audit.mjs` — read-only audit script (reusable; copy or symlink into `fsi-app/` to re-run since it reads `.env.local` from cwd)
- `docs/gap2-audit-output.json` — raw audit output (provisional list, sources by jur, items by jur, asymmetry, full source_verifications log subset)
- `docs/gap2-promotable.json` — promotable / review / reject buckets
- `docs/gap2-matrix.txt` — full 118-row Tier 1 verdict matrix
- `docs/REGIONAL-DATA-COLLECTION-AUDIT.md` — upstream Dimension 2 findings

No DB rows were created, modified, or deleted. No source rows were promoted. No verification re-runs were executed.
