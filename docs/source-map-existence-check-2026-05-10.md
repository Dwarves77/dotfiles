> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# ESG-Today source map existence check, 2026-05-10

## Snapshot context

- Snapshot timestamp: `2026-05-10` (live query against production sources via service role).
- `sources` total: **783** (active 718, provisional 62, suspended 3, admin_only 0).
- `processing_paused=true`: **3** rows.
- `auto_run_enabled=true`: **65** rows. `auto_run_enabled=false`: **718** rows.
- `agent_runs` in last 30 days: **990**. Total `raw_fetches`: **661**.
- The cold-start kill switch flipped `auto_run_enabled=false` on every active source. Per the task brief, the "PRESENT, unscoped" classification, defined as `processing_paused=true OR auto_run_enabled=false`, would otherwise tag 718 of 718 active sources unscoped, collapsing the distinction. This audit therefore reads "unscoped" only against `processing_paused=true` and treats `auto_run_enabled=false` as background-state-of-the-world, not a per-source signal. Healthy and broken classifications below remain meaningful: they reflect whether each source has produced a successful agent_run, a populated `last_checked`, or a `raw_fetches` row in the snapshot window.
- The source map under audit is `dotfiles/docs/source-map-from-esgtoday-2026-05-09.md` (Sections A through F plus G profile). Cross-referenced docs: `four-page-architecture-survey-2026-05-09.md`, `source-coverage-diagnostic-2026-05-09.md`, `classification-rules-audit-2026-05-09.md`.
- Read-only audit. Three throwaway scripts at `fsi-app/scripts/_existence-check-temp.mjs`, `_existence-check-summary.mjs`, `_existence-check-tabular.mjs`, with intermediate JSON outputs. None are committed.

## TL;DR

286 mapped entries probed across Sections A through G (Section G is the ESG Today profile, included as one row).

- **PRESENT, healthy: 64** entries (22%).
- **PRESENT, broken ingestion: 13** entries (5%).
- **PRESENT, unscoped: 0** entries (because the kill switch reading was excluded; see Snapshot context above).
- **ABSENT: 209** entries (73%).

The ABSENT figure is dominated by Sections C1, C2, C3, C4 (corporate actors), where 130 of 132 entries are absent. That is consistent with the source map's own framing in Section H: corporate-actor presence in the registry is essentially zero today, and the map was the first attempt to surface it.

The four EU-ESRS-arc sources called out in the coverage diagnostic, snapshot 2026-05-10:

- `finance.ec.europa.eu`: **ABSENT**. Zero rows match by host or URL. Confirms the diagnostic's Mode-A finding.
- `ec.europa.eu/finance`: **ABSENT** (not in the source map under that exact subpath; treated as folded into finance.ec.europa.eu).
- `efrag.org`: **PRESENT, broken ingestion**. One row, `71b29085-7625-4f90-8693-946a89377fed`, status `provisional`, tier 2, `last_checked=null`, `last_scanned=null`, `last_intelligence_item_at=null`, zero `raw_fetches`, zero `agent_runs` in the 30-day window.
- `esgtoday.com`: **PRESENT, healthy** (changed since the diagnostic). Row `6a4fbc59-5412-4541-a9a3-eeb155b15cc6`, status `active`, tier 4, `last_checked=null` but **1 raw_fetch** and **1 successful agent_run** in last 30 days. The cold-start has now touched this source; the diagnostic's Mode-B reading is partially closed for ESG Today specifically.

T1-priority adds (per Suggested addition priority bands below): **6 entries**. These are the named structural EU-ESRS gap closers plus the highest-density sustainability-finance authorities currently absent.

## Per-section findings

### Section A1, EU bodies

Subtotal: 4 of 15 PRESENT-healthy, 5 of 15 PRESENT-broken, 6 of 15 ABSENT. Present share 60%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| European Commission, DG FISMA | finance.ec.europa.eu | ABSENT | 0 | n/a | T1 priority. The EU-ESRS arc carrier. Confirmed ABSENT in coverage diagnostic. |
| European Commission, DG ENV | environment.ec.europa.eu | P-broken | 1 | all null | 1 row, 0 successes, 2 errors in 30d. Fetcher is failing. |
| European Commission, DG CLIMA | climate.ec.europa.eu | P-healthy | 2 | all null | 2 rows, both have raw_fetches. |
| European Commission, DG MOVE | transport.ec.europa.eu | P-broken | 4 | all null | 4 rows, all 4 are 0s/1-2e in 30d. Whole DG MOVE cluster is broken. |
| European Commission, DG GROW | single-market-economy.ec.europa.eu | ABSENT | 0 | n/a | T2. Industrial policy / made-in-EU. |
| European Commission newsroom | ec.europa.eu/commission/presscorner | P-broken | 2 | all null | host present, subpath unmatched. The matched rows are EU CSDDD growth page (provisional) and the Press Corner home page; both broken. The `presscorner` subpath itself has no exact row. |
| European Parliament | europarl.europa.eu | P-healthy | 1 | all null | 1 row, has raw_fetches. |
| Council of the EU | consilium.europa.eu | P-broken | 2 | 2026-05-04 | 2 rows, both 0s/2e in 30d. last_checked freshness is misleading: prober ran but content fetch failed. |
| EUR-Lex | eur-lex.europa.eu | P-healthy | 16 | 2026-05-09 | 16 matched rows including the bare host; all have raw_fetches; freshest last_checked 2026-05-09. EUR-Lex is the strongest single host in the registry. |
| Official Journal of the EU | eur-lex.europa.eu/oj | P-healthy | 16 | 2026-05-09 | host present, subpath unmatched (no exact `/oj` row). Falls back to the same 16 EUR-Lex rows. |
| European Central Bank (ECB) | ecb.europa.eu | ABSENT | 0 | n/a | T2. Banking supervision / climate risk. |
| ESMA | esma.europa.eu | ABSENT | 0 | n/a | T1 priority. Markets supervision, SFDR, fund naming. EU-ESRS arc adjacency. |
| EBA | eba.europa.eu | ABSENT | 0 | n/a | T1 priority. Banking sustainability disclosure. EU-ESRS arc adjacency. |
| EIOPA | eiopa.europa.eu | ABSENT | 0 | n/a | T2. Insurance and pensions sustainability. |
| EFRAG | efrag.org | P-broken | 1 | all null | 1 row, status `provisional`. T1 priority for promotion-and-fix (already on list). |

### Section A2, UK bodies

Subtotal: 5 of 6 PRESENT-healthy, 0 broken, 1 ABSENT. Present share 83%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| UK FCA | fca.org.uk | ABSENT | 0 | n/a | T1 priority. UK SDS carrier. |
| UK CMA | gov.uk/cma | P-healthy | 5 | 2026-05-08 | host present, subpath unmatched. The 5 gov.uk rows are general UK departments matched by host, not the CMA subpath specifically. |
| UK Department for Business and Trade | gov.uk/dbt | P-healthy | 5 | 2026-05-08 | Same 5-row gov.uk host fallback. UK SDS carrier. |
| UK Treasury | gov.uk/hmt | P-healthy | 5 | 2026-05-08 | Same 5-row gov.uk host fallback. |
| UK DfT | gov.uk/dft | P-healthy | 5 | 2026-05-08 | Same 5-row gov.uk host fallback. SAF mandate carrier. |
| UK DEFRA | gov.uk/defra | P-healthy | 5 | 2026-05-08 | Same 5-row gov.uk host fallback. EPR / packaging. |

The five gov.uk-host rows are doing all the work for six entries, but the subpath unmatched in every case. Per-DG specificity is missing. Treat as registry breadth without depth.

### Section A3, US bodies

Subtotal: 3 of 6 PRESENT-healthy, 1 broken, 2 ABSENT. Present share 67%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| US SEC | sec.gov | P-broken | 1 | all null | 1 row, status `provisional`, no fetches. T1 priority for promotion. |
| US EPA | epa.gov | P-healthy | 6 | 2026-04-30 | 6 rows, all have raw_fetches. |
| Federal Register | federalregister.gov | P-healthy | 3 | 2026-05-07 | 3 rows. **DOUBLE-FLAG**: Federal Register also appears in classification-rules-audit OOS-garbage list (1 garbage item, 100% OOS). Fetch is healthy but extraction is producing interstitial content. |
| California Air Resources Board (CARB) | ww2.arb.ca.gov | P-healthy | 1 | 2026-05-07 | 1 row, fresh last_checked. SB 253 / SB 261 carrier. |
| US State Attorneys General coalitions | (varies) | ABSENT | 0 | n/a | No canonical URL in the source map. Skipped. |
| New York City Comptroller | comptroller.nyc.gov | ABSENT | 0 | n/a | T3. Investor-side signal only. |

### Section A4, other national regulators

Subtotal: 2 of 6 PRESENT-healthy, 0 broken, 4 ABSENT. Present share 33%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| SEBI (India) | sebi.gov.in | ABSENT | 0 | n/a | T2. India BRSR. |
| Dutch AFM | afm.nl | ABSENT | 0 | n/a | T3. NL-specific. |
| Hong Kong HKMA | hkma.gov.hk | ABSENT | 0 | n/a | T3. HK taxonomy. |
| Germany BMWK | bmwk.de | ABSENT | 0 | n/a | T2. DE industrial decarb funding. |
| France Ministry of Ecology | ecologie.gouv.fr | P-healthy | 1 | all null | 1 row, no fetches yet but classified healthy because cold-start has not failed. Edge case, weak healthy signal. |
| ANTAQ (Brazil) | gov.br/antaq | P-healthy | 3 | 2026-05-09 | host present, subpath unmatched. 3 gov.br rows from broader Brazil cohort, all have raw_fetches. ANTAQ subpath specifically unconfirmed. |

### Section A5, sustainability standards bodies

Subtotal: 4 of 7 PRESENT-healthy, 1 broken, 2 ABSENT. Present share 71%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| IFRS Foundation | ifrs.org | P-healthy | 1 | all null | 1 row. |
| ISSB | ifrs.org/issb | P-healthy | 1 | all null | host present, subpath unmatched. Falls back to IFRS row. ISSB sub-area not separately registered. |
| GRI | globalreporting.org | P-healthy | 3 | all null | 3 rows, all with raw_fetches. |
| SASB | sasb.org | ABSENT | 0 | n/a | T2. Industry-specific standards. |
| TCFD legacy | fsb-tcfd.org | ABSENT | 0 | n/a | T3. Legacy framework. |
| TNFD | tnfd.global | P-broken | 1 | all null | 1 row, provisional. T2 for promotion. |
| SBTi | sciencebasedtargets.org | P-healthy | 1 | all null | 1 row. Weak healthy. |

### Section A6, intergovernmental and standards bodies (transport-specific)

Subtotal: 11 of 11 PRESENT-healthy, 0 broken, 0 ABSENT. Present share 100%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| IMO | imo.org | P-healthy | 11 | all null | 11 rows, 9 with raw_fetches, 2 provisional. Strong coverage. |
| IMO MEPC documents | imo.org/en/MediaCentre/MeetingSummaries/MEPC | P-healthy | 11 | all null | host present, subpath unmatched. Falls back to the 11 IMO rows; the MEPC subpath specifically is not a registered URL. |
| ICAO | icao.int | P-healthy | 2 | all null | 2 rows. |
| ICAO CAEP | icao.int/environmental-protection/Pages/CAEP.aspx | P-healthy | 2 | all null | host present, subpath unmatched. |
| IATA | iata.org | P-healthy | 4 | all null | 4 rows, 2 with raw_fetches, 2 provisional. |
| IEA | iea.org | P-healthy | 11 | 2026-05-07 | 11 rows, all with raw_fetches. Fresh. |
| IRENA | irena.org | P-healthy | 11 | 2026-05-04 | 11 rows, all with raw_fetches. |
| IPCC | ipcc.ch | P-healthy | 3 | all null | 3 rows. |
| World Bank | worldbank.org | P-healthy | 2 | all null | 2 rows. |
| ICAP | icapcarbonaction.com | P-healthy | 3 | 2026-04-30 | 3 rows. |
| OECD | oecd.org | P-healthy | 5 | all null | 5 rows. |

A6 is the strongest section in the audit. Intergovernmental transport-mode coverage is genuinely deep. The subpath gap (MEPC, CAEP) is a precision issue, not a coverage one.

### Section B1, cross-cutting sustainability trade press

Subtotal: 3 of 10 PRESENT-healthy, 0 broken, 7 ABSENT. Present share 30%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| ESG Today | esgtoday.com | P-healthy | 1 | all null | 1 row, has 1 raw_fetch and 1 successful agent_run in 30d. Improvement vs. coverage diagnostic snapshot. |
| Reuters Sustainable Switch | reuters.com/sustainability | P-healthy | 1 | all null | 1 row, weak healthy. |
| Bloomberg Green | bloomberg.com/green | ABSENT | 0 | n/a | T2. Paywalled, but RSS/digest available. |
| FT Moral Money | ft.com/moral-money | ABSENT | 0 | n/a | T3. Paywalled. |
| S&P Global Sustainable1 (news) | spglobal.com/esg/insights | ABSENT | 0 | n/a | T2. |
| Carbon Pulse | carbon-pulse.com | ABSENT | 0 | n/a | T1 priority. Primary source for ETS coverage. Already a coverage diagnostic candidate. |
| Responsible Investor | responsible-investor.com | ABSENT | 0 | n/a | T2. Investor-side ESG. |
| Environmental Finance | environmental-finance.com | ABSENT | 0 | n/a | T2. Sustainable-finance instruments. |
| GreenBiz | greenbiz.com | P-healthy | 2 | all null | 2 rows, both have raw_fetches. |
| Edie | edie.net | ABSENT | 0 | n/a | T3. UK-focused. |

### Section B2, freight and transport trade press

Subtotal: 7 of 12 PRESENT-healthy, 0 broken, 5 ABSENT. Present share 58%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| FreightWaves | freightwaves.com | P-healthy | 4 | all null | 4 rows, all have raw_fetches. Confirms the four-page-survey duplicate-by-trailing-slash finding (FreightWaves has multiple drift rows). |
| Journal of Commerce (JOC) | joc.com | P-healthy | 2 | all null | 2 rows. |
| Lloyd's List | lloydslist.com | P-healthy | 1 | all null | 1 row. Paywalled. |
| Air Cargo News | aircargonews.net | P-healthy | 1 | all null | 1 row. |
| Cargo Facts | cargofactsconsulting.com | ABSENT | 0 | n/a | T3. Air freight market data. |
| The Loadstar | theloadstar.com | P-healthy | 2 | all null | 2 rows. |
| Splash 247 | splash247.com | P-healthy | 3 | all null | 3 rows. |
| TradeWinds | tradewindsnews.com | P-healthy | 1 | all null | 1 row. Paywalled. |
| Container News | container-news.com | ABSENT | 0 | n/a | T3. |
| FleetOwner | fleetowner.com | ABSENT | 0 | n/a | T3. |
| Transport Topics | ttnews.com | ABSENT | 0 | n/a | T2. ATA publication. |
| Air Transport World | atwonline.com | ABSENT | 0 | n/a | T3. |

Freight trade press coverage is the second-strongest after A6. The five missing entries are all secondary publications.

### Section B3, industry data providers and energy intelligence

Subtotal: 1 of 13 PRESENT-healthy, 0 broken, 12 ABSENT. Present share 8%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| BloombergNEF | about.bnef.com | P-healthy | 1 | all null | 1 row. Weak healthy. |
| Wood Mackenzie | woodmac.com | ABSENT | 0 | n/a | T2. |
| Rystad Energy | rystadenergy.com | ABSENT | 0 | n/a | T2. |
| S&P Global Platts | spglobal.com/commodityinsights | ABSENT | 0 | n/a | T2. SAF and fuel pricing. |
| Argus Media | argusmedia.com | ABSENT | 0 | n/a | T2. SAF pricing. |
| ICIS | icis.com | ABSENT | 0 | n/a | T3. |
| MSCI | msci.com/research | ABSENT | 0 | n/a | T3. |
| Moody's | moodys.com | ABSENT | 0 | n/a | T3. |
| Morgan Stanley Sustainable Investing | morganstanley.com/ideas | ABSENT | 0 | n/a | T3. |
| FTSE Russell | ftserussell.com/research | ABSENT | 0 | n/a | T3. |
| LinkedIn Economic Graph | economicgraph.linkedin.com | ABSENT | 0 | n/a | T3. |
| Workiva | workiva.com/insights | ABSENT | 0 | n/a | T3. |
| HSBC research | hsbc.com/news-and-views | ABSENT | 0 | n/a | T3. |

B3 is the weakest section among non-corporate. Industry data providers are the structural Market Intel feed; their absence aligns with the four-page survey's "weak fit" verdict for the Market page (no time-series schema, no provider feeds).

### Section C1, freight forwarding and carrier majors

Subtotal: 0 of 39 PRESENT-healthy, 0 broken, 39 ABSENT. Present share 0%.

All 39 entries are absent. Spans 11 ocean carriers (Maersk, MSC, CMA CGM, Hapag-Lloyd, ZIM, COSCO, ONE, Evergreen, Yang Ming, HMM, Wan Hai), 10 air freight carriers (Cargolux, Lufthansa Cargo, Air France-KLM Cargo, Atlas Air, Cathay Cargo, Emirates SkyCargo, Qatar Airways Cargo, Korean Air Cargo, Singapore Airlines Cargo, Turkish Cargo), 3 integrators (FedEx, UPS, DHL), 8 forwarders (Kuehne+Nagel, DSV, DB Schenker, Expeditors, Geodis, Yusen Logistics, Nippon Express, Sinotrans), and 7 specialized fine-art carriers (Crozier, Hasenkamp, Masterpiece International, Constantine, Momart, Crown Fine Art, Helu-Trans).

Confirms the source-map's framing: the registry has no T6 vendor-claim layer for the freight industry's own corporate signals. T1 priority for the operator's vertical: 7 fine-art carriers.

### Section C2, equipment manufacturers

Subtotal: 0 of 29 PRESENT-healthy, 0 broken, 29 ABSENT. Present share 0%.

All 29 entries absent. Spans trucks (Volvo, Daimler, Mercedes-Benz, Scania, MAN, Iveco, Tesla Semi, BYD, Nikola, Quantron, Renault, Hino, Isuzu), aviation (Boeing, Airbus, ATR, Embraer, Bombardier, Pratt & Whitney, GE Aerospace, Rolls-Royce), maritime (COSCO Shipbuilding, Hyundai Heavy, Daewoo Shipbuilding, MHI, Wartsila), and crating (Rokbox, Earthcrate, Yondr).

Same shape as C1.

### Section C3, fuel and energy providers

Subtotal: 1 of 27 PRESENT-healthy, 1 broken, 25 ABSENT. Present share 7%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| SkyNRG | skynrg.com | P-broken | 1 | all null | 1 row, provisional. |
| Yara | yara.com | P-healthy | 1 | all null | 1 row, weak healthy. |

The other 25 (Neste, World Energy, Gevo, Twelve, LanzaJet, Aemetis, Velocys, Montana Renewables, Plug Power, Air Liquide, Linde, Cummins, Ballard Power, ITM Power, Electrify America, ChargePoint, EVgo, Ionity, Tesla Supercharger, TotalEnergies Marine, Shell Marine, BP Maritime, Bunker Holding, Methanex, Stena Bulk) are all absent.

### Section C4, major corporate sustainability actors

Subtotal: 0 of 37 PRESENT-healthy, 0 broken, 37 ABSENT. Present share 0%.

All 37 entries absent. Spans auction houses (Christie's, Sotheby's, Phillips, Bonhams), galleries (Hauser and Wirth, White Cube, Pace, David Zwirner, Gagosian), museums (Glenstone, MoMA, Tate, Met, Guggenheim, V&A, Louvre), live event operators (Live Nation, AEG, FIFA, World Athletics, IOC, Goldenvoice), studios (Disney, WBD, Sony Pictures, Netflix, Universal, Paramount, Apple TV+, Amazon MGM), and luxury (LVMH, Kering, Richemont, Hermes, Chanel, Rolex, Patek Philippe).

Same shape as C1, C2. Of these, the 4 auction houses, 5 galleries, and 6 luxury houses are direct operator-vertical clients and rank T2 within the corporate band.

### Section D, industry associations

Subtotal: 9 of 21 PRESENT-healthy, 2 broken, 10 ABSENT. Present share 52%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| IATA | iata.org | P-healthy | 4 | all null | 4 rows, 2 raw_fetches, 2 provisional. (Same row set as A6.) |
| A4E | a4e.eu | ABSENT | 0 | n/a | T3. |
| ACI | aci.aero | P-broken | 1 | all null | 1 row, provisional. |
| TIACA | tiaca.org | P-healthy | 1 | all null | 1 row. |
| ICS | ics-shipping.org | ABSENT | 0 | n/a | T2. |
| BIMCO | bimco.org | P-broken | 1 | all null | 1 row, provisional. |
| World Shipping Council | worldshipping.org | ABSENT | 0 | n/a | T2. |
| DNV | dnv.com | P-healthy | 2 | all null | 2 rows, 1 raw_fetch, 1 provisional. |
| Lloyd's Register | lr.org | P-healthy | 2 | all null | 2 rows. **DOUBLE-FLAG**: Lloyd's Register is also the largest multi-ambiguous concentration in classification-rules-audit (41 items, 26 multi-ambiguous, 63%). Ingestion is healthy; classification of the output is the issue. |
| ABS | eagle.org | ABSENT | 0 | n/a | T3. |
| Bureau Veritas Marine | bureauveritas.com | ABSENT | 0 | n/a | T3. |
| RINA | rina.org | ABSENT | 0 | n/a | T3. |
| ClassNK | classnk.or.jp | P-healthy | 1 | all null | 1 row. |
| IRU | iru.org | P-healthy | 1 | all null | 1 row. |
| ATA (American Trucking) | trucking.org | P-healthy | 1 | all null | 1 row. |
| ECTA | ecta.com | ABSENT | 0 | n/a | T3. |
| Clean Trucking Alliance | cleantrucking.org | ABSENT | 0 | n/a | T3. |
| AAR | aar.org | ABSENT | 0 | n/a | T3. |
| CER (European Railway) | cer.be | P-healthy | 3 | all null | 3 rows, all raw_fetches. |
| WEF freight | weforum.org | P-healthy | 2 | all null | 2 rows. |
| World Bank LPI | lpi.worldbank.org | ABSENT | 0 | n/a | T2. (World Bank top-level is in A6 healthy.) |

### Section E1, live events sustainability (operator differentiation)

Subtotal: 2 of 7 PRESENT-healthy, 0 broken, 5 ABSENT. Present share 29%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| A Greener Future | agreenerfuture.com | ABSENT | 0 | n/a | T2 vertical. Festival certification. |
| Music Declares Emergency | musicdeclares.net | ABSENT | 0 | n/a | T3. |
| REVERB | reverb.org | P-healthy | 1 | all null | 1 row, weak healthy. |
| Julie's Bicycle | juliesbicycle.com | P-healthy | 1 | all null | 1 row. UK arts/music. |
| Vision:2025 | visionforsustainableevents.com | ABSENT | 0 | n/a | T3. UK outdoor events. |
| Climate Beacon | climatebeacon.com | ABSENT | 0 | n/a | T3. |
| MIT ClimateMachine | media.mit.edu | ABSENT | 0 | n/a | T2. Active operator partnership; primary Rockit data contributor. |

### Section E2, fine art and museum logistics sustainability

Subtotal: 0 of 5 PRESENT-healthy, 0 broken, 5 ABSENT. Present share 0%.

All 5 entries absent: Gallery Climate Coalition (galleryclimatecoalition.org, **T1 priority** for fine-art differentiation), Bizot Group (bizotgroup.org), AAM Sustainability Working Group (aam-us.org), ICOM-CC (icom-cc.org), IIC (iiconservation.org).

E2 is the most operator-vertical-defining gap in the audit. GCC alone is the standard-setter for the fine-art freight emissions calculation and is missing.

### Section E3, film/TV production sustainability

Subtotal: 0 of 3 PRESENT-healthy, 0 broken, 3 ABSENT. Present share 0%.

All 3 absent: albert (BAFTA, **T2**), PGA Green, Sustainable Film.

### Section E4, humanitarian logistics

Subtotal: 1 of 4 PRESENT-healthy, 0 broken, 3 ABSENT. Present share 25%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| UNHRD | unhrd.org | ABSENT | 0 | n/a | T2. |
| OCHA | unocha.org | ABSENT | 0 | n/a | T2. |
| Logistics Cluster | logcluster.org | ABSENT | 0 | n/a | T2. |
| IATA Humanitarian | iata.org | P-healthy | 4 | all null | Same 4-row IATA cluster as A6 / D. The "Humanitarian" sub-area is not separately registered. host-only match. |

### Section E5, academic and peer-reviewed research bodies

Subtotal: 6 of 11 PRESENT-healthy, 0 broken, 5 ABSENT. Present share 55%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| MIT Climate Portal | climate.mit.edu | ABSENT | 0 | n/a | T2. Active operator partnership. |
| MIT Media Lab | media.mit.edu | ABSENT | 0 | n/a | T2. |
| Cambridge CISL | cisl.cam.ac.uk | ABSENT | 0 | n/a | T3. |
| Stanford Doerr | sustainability.stanford.edu | ABSENT | 0 | n/a | T3. |
| Tyndall Centre | tyndall.ac.uk | P-healthy | 3 | all null | 3 rows. |
| NREL | nrel.gov | P-healthy | 5 | all null | 5 rows. |
| Rocky Mountain Institute (RMI) | rmi.org | P-healthy | 2 | all null | 2 rows, 1 provisional. |
| ICCT | theicct.org | P-healthy | 1 | all null | 1 row. Transport decarb research. |
| Smart Freight Centre | smartfreightcentre.org | P-healthy | 4 | all null | 4 rows, all raw_fetches. GLEC framework carrier. |
| World Resources Institute (WRI) | wri.org | P-healthy | 2 | all null | 2 rows. |
| C40 Cities | c40.org | ABSENT | 0 | n/a | T3. |

### Section F, operations layer sources

Subtotal: 4 of 16 PRESENT-healthy, 3 broken, 9 ABSENT. Present share 44%.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| BLS | bls.gov | P-healthy | 2 | all null | 2 rows. |
| Eurostat | ec.europa.eu/eurostat | P-broken | 2 | all null | host present, subpath unmatched. 2 ec.europa.eu rows, 1 all-error 30d, 1 provisional. |
| ONS (UK) | ons.gov.uk | ABSENT | 0 | n/a | T2. |
| ILO | ilo.org | P-healthy | 2 | 2026-05-02 | 2 rows, 1 raw_fetch, 1 provisional. |
| EIA | eia.gov | P-healthy | 9 | 2026-05-07 | 9 rows, all raw_fetches. Strongest US energy source. |
| ENTSO-E | entsoe.eu | ABSENT | 0 | n/a | T2. EU energy data. |
| WCO | wcoomd.org | P-broken | 1 | all null | 1 row, provisional. |
| US CBP | cbp.gov | P-broken | 3 | all null | 3 rows, all 3 provisional. |
| Port of Rotterdam | portofrotterdam.com | ABSENT | 0 | n/a | T2. |
| Port of Singapore (PSA) | globalpsa.com | ABSENT | 0 | n/a | T2. |
| Port of LA | portoflosangeles.org | P-healthy | 3 | all null | 3 rows, all raw_fetches. |
| Port of Hong Kong | mardep.gov.hk | ABSENT | 0 | n/a | T3. |
| Heathrow | heathrow.com | ABSENT | 0 | n/a | T3. |
| Schiphol | schiphol.nl | ABSENT | 0 | n/a | T3. |
| Frankfurt Airport | frankfurt-airport.com | ABSENT | 0 | n/a | T3. |
| JFK | jfkairport.com | ABSENT | 0 | n/a | T3. |

### Section G, ESG Today profile

Subtotal: 1 PRESENT-healthy.

| Body | Map URL | Status | N rows | Best last_checked | Sub-finding |
|---|---|---|---|---|---|
| ESG Today | esgtoday.com | P-healthy | 1 | all null | Same row as B1. Has 1 raw_fetch, 1 successful agent_run in 30d. RSS feed configured. |

## Cross-references

### 185 unknowns from four-page architecture survey

The four-page-survey URL+name keyword classifier left 185 of 718 active sources in an "unknown" bucket (26%). That bucket was a heuristic miss against US-and-EU-centric `.gov`/`.eu` regex patterns; the survey's own examples were Ley Chile, congreso.es, Transport Canada, Sabin Center, USGBC LEED.

Cross-reference test: how many of the 185 unknowns map cleanly into Sections A through F of the source map by URL pattern?

The audit cannot do a row-by-row join because the four-page survey did not write the 185 unknown source IDs to a persisted artifact. What is assertable from the survey's published examples plus URL pattern logic:

- Sections A1 to A6 cover only the regulatory bodies the source map names. The 185 unknowns include national legislatures (Ley Chile, congreso.es) and provincial / national second-tier regulators (Transport Canada, USGBC, Sabin Center) that are NOT in the source map's A1 to A6 universe. They would map to a "national jurisdictions outside the named A1 to A6 set" cell that the source map does not enumerate.
- Section B (trade press + data providers) and Section C (corporate actors) are highly unlikely matches: 185 unknowns is dominated by `.gov` / parliamentary / second-tier-regulator URLs per the survey's evidence sample.
- Section D (industry associations) is a possible mapping for ~2-5 of the unknowns (USGBC fits "Cross-sector industry standards"). Section E is unlikely to absorb any unknowns.
- Section F (operations layer) is the most plausible host: jurisdiction-specific data portals, customs authorities, port authorities, and labour-data agencies live in the unknown bucket. F1 named only ~10 examples (BLS, Eurostat, ONS, ILO, EIA, ENTSO-E, WCO, CBP, ports, airports). The 185 unknowns likely contain dozens of jurisdiction-specific F-shaped sources that the source map under-enumerates.

Best-effort estimate: **fewer than 30 of the 185 unknowns (~16%) map cleanly into a Section A through F cell as written**. The source map is a coverage spec for international and EU/US-anchored bodies; the 185-unknown bucket is dominated by national-jurisdiction sub-tier sources outside that frame. Both findings are useful but they describe different population slices. Resolving the 185 unknowns requires either (a) extending Section F with per-jurisdiction sub-cells or (b) running a separate national-jurisdiction-coverage matrix.

### Coverage diagnostic 4 EU-ESRS sources

Status confirmed against this snapshot:

| Source | Coverage diagnostic verdict (2026-05-09) | This audit verdict (2026-05-10) | Change |
|---|---|---|---|
| finance.ec.europa.eu | Mode A, not in registry | ABSENT | unchanged |
| ec.europa.eu/finance | not in registry | ABSENT (folded into above) | unchanged |
| efrag.org | Mode B + C, registered provisional, zero fetches | PRESENT, broken ingestion (provisional, zero fetches) | unchanged |
| esgtoday.com | Mode B, registered active, zero fetches | PRESENT, healthy (1 raw_fetch, 1 success in 30d) | **improved**: cold-start has now touched ESG Today |

The improvement on ESG Today indicates the cold-start has progressed past the dormant-trade-press cohort. EFRAG remains untouched, which is consistent with the diagnostic's secondary finding that provisional rows may be excluded from cold-start sweep (Mode C, contributing factor for EFRAG). finance.ec.europa.eu remains the dominant Mode-A miss.

### Classification audit 49 garbage-extraction sources

The classification-rules-audit identified 49 sources whose items 100% Out-of-Scope by garbage-extraction (Cloudflare interstitials, CAPTCHA gates, 403 pages misread as content). Per its top-OOS table, these are dominated by parliamentary scrapes (Hellenic Parliament, Cyprus Parliament, Parliament of Malta, Assembleia da Republica PT, Wisconsin State Legislature, Tasmanian Parliament, Northern Territory Legislative Assembly) plus environmental ministries (YPEN Greece, NHDES, Kentucky EEC, Minnesota PUC, NRDEC).

Cross-reference against Section A:

- **None** of the 49 named garbage hosts are in the source map's A1 to A4 named bodies (the source map only lists EU and UK and US federal bodies plus 6 named other-national regulators; none of those are parliamentary scrapes per se).
- **One** double-flag confirmed: **Federal Register** appears in the OOS-garbage table (1 garbage item, 100% OOS) AND in Section A3 of the source map AND classified PRESENT, healthy here on the basis of 3 raw_fetches. The implication: ingestion is succeeding, but at least 1 of the recent fetches returned interstitial content that was misclassified. This is "in-registry-with-broken-extraction", a fourth state the binary healthy/broken classification does not surface.
- **One** secondary multi-ambiguous double-flag worth naming separately (not in the 49 garbage set, but in the same audit's Section D.3 multi-ambiguous concentration): **Lloyd's Register** appears in Section D of the source map AND has 41 multi-ambiguous items (26 of 41, 63%) in the classification audit. PRESENT, healthy here, but content quality in the corpus is mixed for a different reason: Lloyd's Register is a classification society publishing regulation-shaped Class Notices that the rule-based classifier cannot pin to a single role.

Net cross-reference verdict: **the 49 garbage-extraction set is not a Section-A overlap problem**. It is a separate operational issue (parliamentary-scrape Cloudflare gates) that the operator already has a known fix for (30-line title-pattern pre-classify gate, per the classification-rules-audit). Federal Register and Lloyd's Register are the two genuinely-overlapping double-flags surfaced in this audit.

## Suggested addition priority bands

The operator decides whether to add these. This audit ranks them.

### T1, would close named structural gaps (6 entries)

T1 is reserved for entries that close a documented structural miss, not the entire ABSENT set. These six are the highest-leverage additions on this map.

1. **`finance.ec.europa.eu`** (DG FISMA). Closes the Mode-A coverage diagnostic miss. Carrier of the EU-ESRS-arc trigger event. ABSENT today.
2. **`esma.europa.eu`** (ESMA). Markets supervision, SFDR, fund naming. Adjacency to EU-ESRS arc; ABSENT today.
3. **`eba.europa.eu`** (EBA). Banking sustainability disclosure. Adjacency to EU-ESRS arc; ABSENT today.
4. **`fca.org.uk`** (UK FCA). UK SDS carrier; the UK-side analogue of the EU-ESRS gap. ABSENT today.
5. **`carbon-pulse.com`** (Carbon Pulse). Primary source for carbon-market and ETS coverage; the source map's Section H specifically calls it out for competitor-intercept telemetry. ABSENT today.
6. **`sec.gov`** (US SEC). Already PRESENT but provisional and broken-ingestion. Promote-and-fix priority. The SEC climate-disclosure rule is the US-side analogue of the EU-ESRS arc.

### T2, closes high-traffic verticals (12 entries)

T2 entries close the operator's six-vertical differentiation gap, the documented "Caro's Ledge actual differentiation" per the source map's Section E framing.

1. **`galleryclimatecoalition.org`** (GCC). Single most operator-vertical-defining gap in the audit; carbon calculator and materials guidance for fine art. ABSENT.
2. **`agreenerfuture.com`** (A Greener Future). Live events vertical. ABSENT.
3. **`wearealbert.org`** (albert/BAFTA). Film/TV vertical. ABSENT.
4. **`unhrd.org`** (UNHRD). Humanitarian vertical. ABSENT.
5. **`unocha.org`** (OCHA). Humanitarian vertical. ABSENT.
6. **`logcluster.org`** (Logistics Cluster). Humanitarian vertical. ABSENT.
7. **`bizotgroup.org`** (Bizot Group). Fine art / museums. ABSENT.
8. **`aam-us.org`** (AAM). Museums. ABSENT.
9. **`climate.mit.edu`** (MIT Climate Portal). Active operator partnership; live events vertical adjacency. ABSENT.
10. **`media.mit.edu`** (MIT Media Lab). Same partnership. ABSENT.
11. **`tnfd.global`** (TNFD). Already PRESENT, provisional. Promote-and-fix.
12. **`efrag.org`** (EFRAG). Already PRESENT, provisional. Promote-and-fix; EU-ESRS arc carrier.

### T3, background coverage (62-plus entries)

T3 includes the broad set of corporate actors (Sections C1, C2, C3, C4) plus secondary trade press, secondary data providers, secondary national regulators, and secondary operations sources. Among the 209 ABSENT entries, the ~62 named below are the most defensible T3 additions; the remainder (corporate actors at long-tail vertical relevance) can be added selectively as the source-role taxonomy is built out.

Notable T3 sub-clusters:
- **Industry data providers**: Bloomberg Green, FT Moral Money, S&P Global Sustainable1, Responsible Investor, Environmental Finance, Wood Mackenzie, Rystad Energy, S&P Global Platts, Argus Media, ICIS (10).
- **Secondary national regulators**: SEBI, Dutch AFM, HKMA, BMWK, ECB, EIOPA, SASB, TCFD, NYC Comptroller (9).
- **Secondary freight trade press**: Cargo Facts, Container News, FleetOwner, Transport Topics, Air Transport World (5).
- **Industry associations**: A4E, ICS, World Shipping Council, ABS, Bureau Veritas, RINA, ECTA, Clean Trucking Alliance, AAR, World Bank LPI (10).
- **Operations layer**: ONS, ENTSO-E, Port of Rotterdam, PSA, mardep.gov.hk, Heathrow, Schiphol, Frankfurt, JFK (9).
- **Operator-vertical client corporate**: 4 auction houses, 5 galleries, 7 luxury houses (16). High-affinity but T6 vendor-claim tier on the source-map's own taxonomy; selective add only.
- **Other corporate**: 31 carriers and forwarders, 22 equipment manufacturers, 8 live event operators / studios (61), worth adding only behind the source-role taxonomy decision the four-page survey already named as a structural gap.

## Methodology

### URL normalization

Both sides of the match (registry URL and source-map candidate URL) are normalized via:
1. Lowercase.
2. Strip protocol prefix (`http://`, `https://`).
3. Strip leading `www.`.
4. Strip trailing `/`.

Match attempted in two passes, in order: (a) exact normalized-URL equality, then (b) host equality (host = first segment before the first `/` of the normalized URL).

A `subpathUnmatched` flag is set to true when the source map carries a subpath (target normalized URL contains `/`) but no registry row exact-matches that path; the result is downgraded to a host-only match. Rows behind a host-only match are listed but the entry is annotated "host present, subpath unmatched".

### Health classification

For each registry row matched to a source-map entry:
- **PRESENT, healthy**: row has a successful agent_run in the last 30 days OR `last_checked` within the last 30 days OR `raw_fetches` count > 0.
- **PRESENT, broken ingestion**: row has all three (`last_checked`, `last_scanned`, `last_intelligence_item_at`) null AND zero `raw_fetches`, OR all agent_runs in the last 30 days are status=`error`, OR no recent successful run plus no recent last_checked plus zero fetches.
- **PRESENT, unscoped**: row has `processing_paused=true`. (Per task brief: `auto_run_enabled=false` is excluded from the unscoped definition because all 718 active sources carry it post-cold-start kill switch; including it would make 718 of 718 unscoped, defeating the distinction.)
- **ABSENT**: no row matches by exact URL or by host.

When an entry matches multiple registry rows, the entry's aggregate status is the best-of: PRESENT, healthy if any matched row is healthy; PRESENT, unscoped only if every matched row is unscoped; PRESENT, broken otherwise.

### Sample sizes and where heuristics may misclassify

- Registry: full 783-row pull with all classifier fields.
- Recent agent_runs window: 30 days, 990 rows.
- Total raw_fetches: 661 rows, all-time.
- Source-map entries probed: 286 (some entries appear twice because the source map listed them in two sections; e.g., IATA in A6, D, and E4; ESG Today in B1 and G).

Misclassification risks:
- **Subpath reduction**: 14 entries of 286 fall back from subpath to host match. The host-match returns rows about other sub-areas of the same domain. Example: ec.europa.eu/commission/presscorner falls back to two other ec.europa.eu rows (CSDDD growth page + presscorner home), neither of which is the precise newsroom entrypoint the source map had in mind. The aggregate status reported reflects the matched rows, not the missed precise subpath.
- **Multi-row matches**: 10+ entries match 5 or more registry rows because the host is a major domain (gov.uk has 5 generic UK rows that satisfy any of CMA/DBT/HMT/DfT/DEFRA via host). The aggregate "PRESENT, healthy" obscures that the precise sub-area is not separately registered.
- **Weak healthy**: 14 entries are classified PRESENT, healthy on the basis of a single row with `last_checked=null` and zero recent runs but where no run has failed yet. These are early-cold-start states and may flip to broken once swept. Examples: France ecologie.gouv.fr (1 row), Reuters Sustainable Switch (1 row), SBTi (1 row).
- **Trailing-slash drift**: the four-page-survey identified FreightWaves as duplicated by trailing slash (tier 4 + tier 5, www-prefix variant). This audit's normalization treats both as the same entry, but the underlying registry duplicates remain visible (FreightWaves matched 4 rows here).
- **Broken-extraction not surfaced**: the binary PRESENT-healthy / PRESENT-broken classification does not separately flag rows whose ingestion succeeds but whose extracted content is garbage (the Federal Register case; see classification audit cross-reference). Such rows are PRESENT, healthy here.

### Read-only constraints

No writes to the database. No registry edits. No source role column added. No schema recommendations made. The three throwaway scripts at `fsi-app/scripts/_existence-check-*.mjs` and the JSON output files are not committed; they will be cleaned up after this audit ships.

This audit feeds the next architectural decision conversation. It does not execute on any of the paused decisions.
