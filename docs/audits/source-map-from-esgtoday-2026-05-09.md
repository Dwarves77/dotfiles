> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Source Registry Expansion

Mapped from ESG Today coverage analysis, May 9, 2026.

For: Caro's Ledge sources table, organized by classification rule.

## Methodology and scope correction

ESG Today coverage was sampled across Government, Regulators, Reports & Studies, ESG Reporting categories. Each article reveals one or more of three source classes relevant to our registry:

1. Regulatory, legislative, and supervisory bodies, primary legal authorities ESG Today cites
2. Trade press, data providers, and aggregators, ESG Today itself plus its peer publications
3. Corporate actors, companies whose announcements are the underlying signals ESG Today aggregates

Under our rule-based classification, all three populate the registry in different roles:

- Regulatory bodies, Regulatory + Research items, T1-T2 source tier
- Trade press, market_news role, T5 source tier (point to primary, not authority on their own)
- Industry data providers, market_news role, T4-T5 (named editorial standards, often paywalled)
- Corporate actors, primary T6 sources for their own announcements (vendor-claim tier), forward-indicating commercial signal under Market Intel rule

Initial framing of this exercise narrowed primary-publishing-body to regulators and standards bodies, treating corporate press as low-value. That was wrong. Corporate press tells us what the industry is doing, which is exactly what Market Intel is supposed to surface. The registry must include corporate sources directly with vendor-claim tier labeling, not rely on trade press to surface them indirectly.

ESG Today's editorial scope is financial-regulatory and corporate ESG disclosure. Their source set is necessary for Caro's Ledge but not sufficient. Sections E and F identify the freight-and-vertical-specific sources ESG Today does not cover, which constitute Caro's Ledge actual differentiation.

## Section A: Regulatory, Legislative, Supervisory Bodies

### A1. EU bodies

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| European Commission, DG FISMA | finance.ec.europa.eu | Financial services regulation, CSRD, ESRS, SFDR | Regulatory + Research |
| European Commission, DG ENV | environment.ec.europa.eu | Environmental regulation, EUDR, Industrial Emissions | Regulatory + Research |
| European Commission, DG CLIMA | climate.ec.europa.eu | Climate regulation, ETS, CBAM, FuelEU, ReFuelEU | Regulatory + Research |
| European Commission, DG MOVE | transport.ec.europa.eu | Transport policy across all modes | Regulatory + Research |
| European Commission, DG GROW | single-market-economy.ec.europa.eu | Industrial policy, made-in-EU rules | Regulatory + Market Intel implications |
| European Commission newsroom | ec.europa.eu/commission/presscorner | Cross-DG press releases | Regulatory + Research |
| European Parliament | europarl.europa.eu | Co-legislator, draft amendments | Research (drafts), Regulatory (adoptions) |
| Council of the EU | consilium.europa.eu | Co-legislator, member state positions | Research + Regulatory |
| EUR-Lex | eur-lex.europa.eu | Official legal text repository | Regulatory (T1 primary) |
| Official Journal of the EU | eur-lex.europa.eu/oj | Legal-effect publication of adopted acts | Regulatory (T1 primary) |
| European Central Bank (ECB) | ecb.europa.eu | Banking supervision, climate risk | Regulatory + Research |
| ESMA | esma.europa.eu | Markets supervision, fund naming, SFDR | Regulatory |
| EBA (European Banking Authority) | eba.europa.eu | Banking sustainability disclosure | Regulatory |
| EIOPA | eiopa.europa.eu | Insurance and pensions sustainability | Regulatory |
| EFRAG | efrag.org | ESRS technical advice preparer | Research (drafts) + Regulatory once adopted |

### A2. UK bodies

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| UK Financial Conduct Authority (FCA) | fca.org.uk | Financial services conduct, UK SDS | Regulatory + Research |
| UK Competition and Markets Authority (CMA) | gov.uk/cma | Greenwashing enforcement | Regulatory |
| UK Department for Business and Trade | gov.uk/dbt | UK Sustainability Disclosure Standards | Regulatory + Research |
| UK Treasury | gov.uk/hmt | Sustainability finance policy | Regulatory + Research |
| UK Department for Transport | gov.uk/dft | Transport-specific regulation including SAF mandate | Regulatory + Research |
| UK DEFRA | gov.uk/defra | EPR packaging, environmental regulation | Regulatory |

### A3. US bodies

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| US SEC | sec.gov | Climate disclosure, fund names, anti-greenwashing | Regulatory |
| US EPA | epa.gov | Vehicle emissions, fuel standards, GHG reporting | Regulatory |
| Federal Register | federalregister.gov | US rulemaking primary publication | Regulatory (T1) |
| California Air Resources Board (CARB) | ww2.arb.ca.gov | California SB 253, SB 261 climate disclosure | Regulatory |
| US State Attorneys General coalitions | (varies) | ESG-related state-level positions | Often Out of Scope for our verticals |
| New York City Comptroller | comptroller.nyc.gov | Pension fund climate alignment | Market Intel (investor signal) |

### A4. Other national regulators

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| SEBI (India) | sebi.gov.in | India ESG ratings, BRSR | Regulatory |
| Dutch AFM | afm.nl | Netherlands sustainability claims | Regulatory |
| Hong Kong HKMA | hkma.gov.hk | Hong Kong sustainable finance taxonomy | Regulatory |
| Germany BMWK | bmwk.de | Industrial decarbonization funding | Operations + Market Intel |
| Government of France, Ministry of Ecology | ecologie.gouv.fr | Fossil fuel transition | Research + Regulatory |
| ANTAQ (Brazil) | gov.br/antaq | Brazil water transport regulation | Regulatory |

### A5. Sustainability standards bodies

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| IFRS Foundation | ifrs.org | Parent of ISSB | Research + Regulatory in adopting jurisdictions |
| ISSB | ifrs.org/issb | IFRS S1, S2 sustainability reporting | Research + Regulatory |
| GRI | globalreporting.org | Global Reporting Initiative standards | Reference (Research only if cited in binding rule) |
| SASB | sasb.org | Industry-specific sustainability standards | Reference |
| TCFD legacy | fsb-tcfd.org | Climate-related financial disclosure framework | Research |
| TNFD | tnfd.global | Nature-related financial disclosure | Research |
| SBTi | sciencebasedtargets.org | Corporate climate target validation | Reference + Market Intel signal |

### A6. Intergovernmental and standards bodies (transport-specific)

These are mostly missing from ESG Today coverage and core to Caro's Ledge.

| Body | Domain | Function | Category(ies) |
|---|---|---|---|
| IMO | imo.org | Maritime regulation, MARPOL, GHG strategy, MEPC, MSC | Regulatory + Research |
| IMO MEPC documents | imo.org/en/MediaCentre/MeetingSummaries/MEPC | Marine Environment Protection Committee outcomes | Regulatory + Research |
| ICAO | icao.int | Aviation regulation, CORSIA, CAEP | Regulatory + Research |
| ICAO CAEP | icao.int/environmental-protection/Pages/CAEP.aspx | Committee on Aviation Environmental Protection | Research |
| IATA | iata.org | Air transport industry standards, SAF tracking | Market Intel + Operations + Research |
| IEA | iea.org | Energy transition data, technology readiness reports | Research, Market Intel for data |
| IRENA | irena.org | Renewable energy data | Research, Market Intel |
| IPCC | ipcc.ch | Climate science assessment reports | Research |
| World Bank | worldbank.org | Logistics Performance Index, carbon pricing data | Research, Operations |
| ICAP | icapcarbonaction.com | ETS tracking globally | Research |
| OECD | oecd.org | Trade, environment, transport policy data | Research, Operations |

## Section B: Trade Press and Aggregator Sources (market_news role)

### B1. Cross-cutting sustainability trade press

| Source | Domain | Notes |
|---|---|---|
| ESG Today | esgtoday.com | Founder Mark Segal CFA. T+24h from primary. Daily newsletter. RSS at /feed/. Add as both content source and competitor-intercept benchmark. |
| Reuters Sustainable Switch | reuters.com/sustainability | Newsletter and dedicated sustainability beat |
| Bloomberg Green | bloomberg.com/green | Climate and sustainability vertical |
| FT Moral Money | ft.com/moral-money | Newsletter and section, paywalled |
| S&P Global Sustainable1 (news side) | spglobal.com/esg/insights | Editorial, distinct from ratings product |
| Carbon Pulse | carbon-pulse.com | Carbon market news, paywalled, primary source for ETS coverage |
| Responsible Investor | responsible-investor.com | Investor-side ESG news |
| Environmental Finance | environmental-finance.com | Sustainable finance instruments coverage |
| GreenBiz | greenbiz.com | Corporate sustainability practitioner news |
| Edie | edie.net | UK-focused corporate sustainability |

### B2. Freight and transport trade press (NOT covered by ESG Today)

These are core for Caro's Ledge. ESG Today does not cover them.

| Source | Domain | Notes |
|---|---|---|
| FreightWaves | freightwaves.com | US-centric freight market intelligence |
| Journal of Commerce (JOC) | joc.com | Ocean and intermodal freight |
| Lloyd's List | lloydslist.com | Maritime news of record, paywalled |
| Air Cargo News | aircargonews.net | Air freight industry news |
| Cargo Facts | cargofactsconsulting.com | Air freight market data |
| The Loadstar | theloadstar.com | Logistics and supply chain news |
| Splash 247 | splash247.com | Maritime daily |
| TradeWinds | tradewindsnews.com | Maritime, paywalled |
| Container News | container-news.com | Container shipping |
| FleetOwner | fleetowner.com | Trucking |
| Transport Topics | ttnews.com | American Trucking Associations publication |
| Air Transport World | atwonline.com | Aviation industry trade |

### B3. Industry data providers and energy intelligence

| Source | Domain | Notes |
|---|---|---|
| BloombergNEF | about.bnef.com | Energy transition data, SAF prices, EV deployment |
| Wood Mackenzie | woodmac.com | Energy and natural resources analysis |
| Rystad Energy | rystadenergy.com | Energy market intelligence |
| S&P Global Platts (S&P Commodity Insights) | spglobal.com/commodityinsights | Fuel price assessments |
| Argus Media | argusmedia.com | Energy and commodity prices including SAF |
| ICIS | icis.com | Chemicals and energy pricing |
| MSCI | msci.com/research | Climate alignment, ESG ratings |
| Moody's | moodys.com | Sustainability bonds, transition finance |
| Morgan Stanley Institute for Sustainable Investing | morganstanley.com/ideas | Investor flow data |
| FTSE Russell | ftserussell.com/research | Asset owner sustainability surveys |
| LinkedIn Economic Graph | economicgraph.linkedin.com | Workforce and green skills data |
| Workiva | workiva.com/insights | Sustainability reporting tooling, surveys |
| HSBC research | hsbc.com/news-and-views | Climate transition surveys |

## Section C: Corporate Actors as Primary Market Intel Sources

Under our Market Intel rule, corporate announcements meet the inclusion criteria when they contain quantitative forward-indicating signals affecting our verticals or transport modes. Tier label: T6 (vendor claim, never sole authority for binding compliance, valid as primary signal of company behavior).

### C1. Freight forwarding and carrier majors

- **Ocean carriers**: Maersk, MSC, CMA CGM, Hapag-Lloyd, ZIM, COSCO, Ocean Network Express (ONE), Evergreen, Yang Ming, HMM, Wan Hai
- **Air freight carriers**: Cargolux, Lufthansa Cargo, Air France-KLM Cargo, Atlas Air, Cathay Cargo, Emirates SkyCargo, Qatar Airways Cargo, Korean Air Cargo, Singapore Airlines Cargo, AirBridgeCargo (legacy), Turkish Cargo
- **Integrators**: FedEx, UPS, DHL, TNT (legacy)
- **Forwarders**: Kuehne+Nagel, DSV (post-Schenker), DB Schenker (transitional), Expeditors, Geodis, Bolloré Logistics (now CMA CGM), Yusen Logistics, Nippon Express, Sinotrans
- **Specialized fine art and high-value**: Crozier, Hasenkamp, Masterpiece International, Constantine, Momart, Crown Fine Art, Helu-Trans

### C2. Equipment manufacturers (technology readiness signals)

- **Trucks**: Volvo Trucks, Daimler Truck, Mercedes-Benz Trucks, Scania, MAN, Iveco, Tesla Semi, BYD, Nikola, Quantron, Renault Trucks, Hino, Isuzu
- **Aviation**: Boeing, Airbus, ATR, Embraer, Bombardier, Pratt & Whitney, GE Aerospace, Rolls-Royce
- **Maritime**: COSCO Shipbuilding, Hyundai Heavy, Daewoo Shipbuilding, Mitsubishi Heavy Industries, Wärtsilä
- **Specialized crating and packaging**: Rokbox, Earthcrate (own products), Yondr Group (data center analog)

### C3. Fuel and energy providers (Market Intel for fuel cost trajectories)

- **SAF producers**: Neste, World Energy, Gevo, Twelve, LanzaJet, Aemetis, SkyNRG, Velocys, Fulcrum (legacy), Montana Renewables
- **Hydrogen**: Plug Power, Air Liquide, Linde, Cummins, Ballard Power, ITM Power
- **EV charging**: Electrify America, ChargePoint, EVgo, Ionity, Tesla Supercharger
- **Maritime fuels**: TotalEnergies Marine, Shell Marine, BP Maritime, Bunker Holding, Methanex (methanol), Yara (ammonia), Stena Bulk (LNG and methanol)
- **Fleet operators announcing fleet electrification**: BYD trucks deployment, Volvo electric truck deployments, Daimler eActros rollouts

### C4. Major corporate sustainability actors in our client base

- **Auction houses**: Christie's, Sotheby's, Phillips, Bonhams
- **Galleries**: Hauser and Wirth, White Cube, Pace, David Zwirner, Gagosian
- **Museum institutions**: Glenstone, MoMA, Tate, Met, Guggenheim, V&A, Louvre, Hauser & Wirth Foundation
- **Live event operators**: Live Nation, AEG Presents, FIFA, World Athletics, IOC, Coachella (Goldenvoice)
- **Studios**: Disney, Warner Bros Discovery, Sony Pictures, Netflix, Universal, Paramount, Apple TV+, Amazon MGM
- **Luxury houses**: LVMH, Kering, Richemont, Hermès, Chanel, Rolex, Patek Philippe (selectively, for sustainability disclosures)

## Section D: Industry Associations (Market Intel + Research)

| Domain | Association | URL |
|---|---|---|
| Air freight | IATA | iata.org |
| Air freight | A4E (Airlines for Europe) | a4e.eu |
| Air freight | ACI (Airports Council International) | aci.aero |
| Air freight | TIACA | tiaca.org |
| Maritime | ICS (International Chamber of Shipping) | ics-shipping.org |
| Maritime | BIMCO | bimco.org |
| Maritime | World Shipping Council | worldshipping.org |
| Maritime classification | DNV | dnv.com |
| Maritime classification | Lloyd's Register | lr.org |
| Maritime classification | ABS | eagle.org |
| Maritime classification | Bureau Veritas Marine | bureauveritas.com |
| Maritime classification | RINA | rina.org |
| Maritime classification | ClassNK | classnk.or.jp |
| Road | IRU (International Road Transport Union) | iru.org |
| Road | ATA (American Trucking Associations) | trucking.org |
| Road | ECTA | ecta.com |
| Road | Clean Trucking Alliance | cleantrucking.org |
| Rail | AAR | aar.org |
| Rail | CER (Community of European Railway) | cer.be |
| Cross-sector | WEF freight working groups | weforum.org |
| Cross-sector | World Bank Logistics Performance Index | lpi.worldbank.org |

## Section E: Vertical-Specific Sources (Caro's Ledge differentiation)

ESG Today does not cover any of these. They are core to our verticals.

### E1. Live events sustainability

| Source | Domain | Notes |
|---|---|---|
| A Greener Future | agreenerfuture.com | Festival and event sustainability certification |
| Music Declares Emergency | musicdeclares.net | Music industry climate movement |
| REVERB | reverb.org | US live music sustainability nonprofit |
| Julie's Bicycle | juliesbicycle.com | UK arts and music sustainability research and tooling |
| Vision for Sustainable Events (Vision:2025) | visionforsustainableevents.com | UK outdoor events supplier directory |
| Climate Beacon | climatebeacon.com | Live entertainment sustainability data |
| MIT ClimateMachine Live Music Assessment | (publication via MIT Media Lab / partners) | Direct partnership: Jason contributed primary Rockit data |

### E2. Fine art and museum logistics sustainability

| Source | Domain | Notes |
|---|---|---|
| Gallery Climate Coalition (GCC) | galleryclimatecoalition.org | Active research arm, carbon calculator, materials guidance |
| Bizot Group climate strategy | (working group, output via member museum sites) | Major museum directors group |
| AAM Sustainability Working Group | aam-us.org | American Alliance of Museums sustainability initiatives |
| ICOM-CC | icom-cc.org | Conservation science including environmental control |
| IIC | iiconservation.org | Conservation research and standards |
| Kim Kraczon materials research | (via H&W publications) | Conservator alternative packing materials body of work |

### E3. Film/TV production sustainability

| Source | Domain | Notes |
|---|---|---|
| albert (BAFTA) | wearealbert.org | UK film/TV carbon calculator and certification |
| PGA Green | producersguild.org/page/sustainability | Producers Guild of America sustainability committee |
| Sustainable Film | sustainablefilm.com | US-based film industry sustainability nonprofit |

### E4. Humanitarian logistics

| Source | Domain | Notes |
|---|---|---|
| UNHRD | unhrd.org | UN emergency logistics depot network |
| OCHA | unocha.org | UN Office for the Coordination of Humanitarian Affairs |
| Logistics Cluster | logcluster.org | Inter-agency humanitarian logistics coordination |
| IATA Humanitarian Working Group | iata.org | Humanitarian air cargo coordination |

### E5. Academic and peer-reviewed research bodies

| Source | Domain | Notes |
|---|---|---|
| MIT Climate Portal | climate.mit.edu | Including ClimateMachine assessments (active partnership) |
| MIT Media Lab | media.mit.edu | Including live music assessment work |
| Cambridge Institute for Sustainability Leadership | cisl.cam.ac.uk | |
| Stanford Doerr School of Sustainability | sustainability.stanford.edu | |
| Tyndall Centre for Climate Change Research | tyndall.ac.uk | UK climate research, source for ACT 1.5 work |
| NREL | nrel.gov | US national lab for renewables |
| Rocky Mountain Institute (RMI) | rmi.org | Energy transition research |
| ICCT | theicct.org | Transport-specific decarbonization research |
| Smart Freight Centre | smartfreightcentre.org | GLEC framework, transport emissions reporting |
| World Resources Institute (WRI) | wri.org | GHG Protocol, sustainable transport research |
| C40 Cities | c40.org | Urban climate action research |

## Section F: Operations layer sources (jurisdictional facts)

ESG Today does not cover these. Required for the Operations rule.

| Source class | Examples |
|---|---|
| US labor data | Bureau of Labor Statistics (bls.gov), state DOL portals |
| EU labor data | Eurostat (ec.europa.eu/eurostat) |
| UK labor data | ONS (ons.gov.uk) |
| ILO global labor | ilo.org |
| US utility tariffs | EIA (eia.gov), state PUC portals |
| EU energy data | ENTSO-E (entsoe.eu), Eurostat energy |
| Customs and trade | WCO (wcoomd.org), US CBP (cbp.gov), EU TARIC |
| Permitting authorities | jurisdiction-specific; needs systematic mapping per jurisdiction |
| Port authorities | Port of Rotterdam, Port of Singapore (PSA), Port of LA, Port of Hong Kong, etc. |
| Airport authorities | Heathrow, Schiphol, Frankfurt, JFK, etc. |

## Section G: ESG Today as registry entry

| Field | Value |
|---|---|
| Domain | esgtoday.com |
| Source tier | T5 (reputable trade press, named editor with finance background) |
| Role | market_news under proposed source_role taxonomy |
| Use cases | (1) Market Intel content sourced from named industry data providers and corporate announcements they aggregate. (2) Competitor-intercept benchmark: if ESG Today publishes on a primary-source development we have not surfaced, our intercept is broken. They are a canary, not a content source we'd republish. |
| RSS feed | esgtoday.com/feed/ |
| Newsletter | Daily digest, alternative ingestion if RSS fails |
| Author primary | Mark Segal (founder, CFA, MBA Columbia, ex-Delaney Capital US equities head) |
| Cycle time observed | T+24h from primary source. Caro's Ledge target should be T+0 to T+hours. |
| Editorial pattern | Five-part structure: lede-of-fact, notable-context, backstory chain, specific provisions, process timeline, primary-source link |

## Section H: Dispatch implications

Three distinct workstreams flow from this map:

1. **Source registry expansion against existing 718-source registry**. Every body in Sections A through F should be checked against the existing registry. Bodies absent get added with appropriate role and tier. Bodies present with broken ingestion get flagged for fix. The 185 unknowns from the four-page survey may resolve once classified against this map.

2. **Coverage gap closure (Sections E and F)**. The freight-and-vertical-specific sources in Sections E and F are what makes Caro's Ledge defensible against ESG Today and similar general-purpose sustainability publications. They cannot be replaced by aggregator coverage because aggregators don't cover them either. Filling these is differentiation work, not parity work.

3. **Competitor-intercept telemetry**. ESG Today, Reuters Sustainable Switch, Bloomberg Green, Carbon Pulse, S&P Global Sustainable1, FT Moral Money should be in the registry with a specific monitoring role: when they publish on a primary-source development we have not surfaced, our intercept latency on the underlying primary source is broken. This is operational telemetry, not content sourcing.

## What this map does NOT do

- Does not check existence in current registry. That requires Claude Code query against sources table.
- Does not assess access method (RSS, API, scrape) for each source. Per-source access method is a separate discovery task.
- Does not validate that each URL is current. URLs were captured from public site footers and historical knowledge; some may have moved.
- Does not include every source ESG Today references across 91 pages of Government, 41 of Regulators, 31 of Reports & Studies. The bodies listed are the recurring institutional sources surfaced from sampled pages. A full-archive crawl would extend the corporate-actor list (Section C) substantially but would not add new institutional sources at meaningful rate; the regulatory and standards body universe converges quickly.

## Related

- [[source-coverage-diagnostic-2026-05-09]] — This diagnostic (ESG Today as canary) directly seeds that source-registry-expansion map covering the missing EU-ESRS + vertical bodies
- [[source-map-existence-check-2026-05-10]] — This is the existence check of that map's Sections A-G entry-by-entry against the registry
- [[SOURCE-TYPE-TAXONOMY-PROPOSAL]] — This map organizes every body by the proposed source_role taxonomy (market_news, vendor-claim T6, primary legal authority)
- [[W2B-discovery-agent-spec]] — Feeds the source-discovery/expansion workstream — Section H's 'check every body against the existing 718-source registry' is that agent's job
