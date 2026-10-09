## Resource Taxonomy

This is a **non-exhaustive snapshot of currently-tracked resources, not a scope boundary** — counts and entries change continuously as the database grows, and the system actively expands beyond this set (surfacing new sources, regulations, and intersections per the Operating Principle above). The resources below are illustrative examples organized into the 7 categories, not the limit of what the platform covers. The governing rule over this inventory is the Operating Principle: creative about WHAT to find, conservative about WHAT to claim.

- Ocean Shipping: IMO GHG Strategy, IMO Net-Zero Framework, FuelEU Maritime, EU ETS Shipping, EU MRV, CII Rating, Getting to Zero Coalition, Poseidon Principles, ESPO, Lloyd's Register Decarbonisation Hub, Global Maritime Forum
- Air Freight: CORSIA, EU ETS Aviation, ReFuelEU SAF, UK SAF Mandate, IATA CO2 Connect, ICAO SAF Dashboard, Airbus ZEROe
- Road and Land: Euro 7, EU CO2 Trucks, CARB ACT/ACF, EPA Heavy-Duty Phase 3, AFIR, European Clean Trucking Alliance, Drive Electric
- Trade and CBAM: EU CBAM, WTO Environment and Trade, UK CBAM, FTA environmental provisions, EUDR
- Compliance and Reporting: CSRD (Omnibus), ISSB/IFRS S2, ISO 14083, GLEC Framework, GHG Protocol Scope 3, CDP Supply Chain, SBTi Transport, EcoVadis
- Global and Cross-modal: Fit for 55, PPWR, EPA Endangerment Rescission, ICS2, CountEmissions EU, SmartWay, regional Asia/LatAm/MEAF trackers
- Research and Intelligence: FIATA, ICCT, ITF, NREL, MIT CTL, Sabin Center, Maritime Carbon Intelligence, FreightWaves, GreenBiz, Reuters Sustainable Business

## 7 Topic Categories

These seven values are the controlled vocabulary for `intelligence_items.topic_tags`. The agent emits topic_tags during regeneration as part of the YAML metadata block (see Database Field Emission). Tags drive the dynamic per-item source pool, filter and search behaviour in the dashboard, and the source-coverage matrix.

- emissions: Carbon pricing, ETS systems, GHG strategies, carbon border adjustments
- fuels: SAF mandates, alternative maritime fuels, e-fuels, hydrogen, ammonia bunkering
- transport: Vehicle standards, fleet mandates, ZEV requirements, infrastructure
- reporting: Disclosure frameworks, emissions accounting standards, ratings, certifications
- packaging: PPWR, circular economy, PFAS restrictions, sustainable packaging
- corridors: Green shipping corridors, port sustainability, shore power, clean air zones
- research: Academic, think-tank, industry news, innovation trackers

Every regulatory, technology, market, operations, or research item touches at least one of these. An item can emit multiple tags when the substance crosses categories (e.g., a SAF mandate touches both `emissions` and `fuels`; ISO 14083 touches both `reporting` and `transport`). The agent emits no more than three tags per item; if more would apply, choose the dominant categories.

The vocabulary is closed. The agent does not emit tags outside this list (e.g., not `carbon-pricing` for `emissions`, not `aviation` for `transport`). An emitted tag outside the vocabulary fails the regeneration.

## Operational Scenario Tags (open vocabulary, intersection-readiness)

`operational_scenario_tags` describes the operational situations a regulation, technology, market signal, or research finding touches. These tags drive intersection detection: when two items share scenario tags, they are intersection candidates and the system surfaces the relationship proactively.

Prefer the core glossary below. Emit a new scenario only when the core glossary doesn't fit and the substance is clearly operational (not generic). Use lower-case kebab-case, no spaces.

Core glossary (~36 values, prefer these):

Ocean: `ocean-bunkering`, `ocean-fuel-blend-mandate`, `ocean-emissions-MRV`, `vessel-port-call`, `vessel-shore-power`, `vessel-CII-rating`, `green-shipping-corridor`

Air: `air-fueling`, `SAF-blending`, `aircraft-emissions-CORSIA`, `aircraft-emissions-ETS`, `airport-shore-power`

Road: `road-cabotage`, `drayage`, `urban-truck-zone`, `truck-CO2-standard`, `road-charging-infrastructure`

Customs/trade: `customs-declaration-import`, `customs-declaration-export`, `CBAM-declaration`, `EUDR-due-diligence`, `dangerous-goods-classification`

Carbon/ETS: `ETS-allowance-purchase`, `ETS-allowance-surrender`, `carbon-pricing-pass-through`, `carbon-border-adjustment`

Reporting: `emissions-reporting-Scope1`, `emissions-reporting-Scope3`, `sustainability-report-CSRD`, `disclosure-ISSB`, `supplier-data-request`

Packaging/products: `packaging-EPR-registration`, `packaging-recyclability-design`, `packaging-PFAS-restriction`, `product-due-diligence-CSDDD`

Each item emits 0-5 scenario tags. An item without an obvious scenario (e.g. background research) may emit an empty array — that's honest. Tags outside the core glossary are allowed when needed but should be the exception, not the rule.

## Compliance Object Tags (closed vocabulary, intersection-readiness)

`compliance_object_tags` names the supply-chain roles or operational entities a regulation imposes obligations on. Closed vocabulary so items joining on the same role are reliably grouped.

Closed glossary (18 values, exact-match required):

Carriers: `carrier-ocean`, `carrier-air`, `carrier-road`, `carrier-rail`

Vehicle/fleet operators: `vessel-operator`, `aircraft-operator`, `road-fleet-operator`

Forwarders & intermediaries: `freight-forwarder`, `customs-broker`, `nvocc`

Cargo principals: `shipper`, `importer`, `exporter`, `manufacturer-producer`, `distributor`

Infrastructure: `port-operator`, `airport-operator`, `terminal-operator`, `warehouse-operator`

Each item emits 0-4 compliance-object tags. An item with no clear compliance object (e.g. a research finding) emits an empty array. Tags outside the glossary fail the regeneration.

## Related Items and Intersection Summary (intersection-readiness)

`related_items` is a UUID array of other intelligence_items the agent identifies as topically or operationally related during brief composition. Populate this only with UUIDs that:
1. Appeared in the agent's source pool input for this run, AND
2. Were drawn on (cited or referenced) during composition, OR represent an obvious operational dependency the agent identified

The integrity rule applies. No invented UUIDs. No links to items the agent didn't actually consider.

`intersection_summary` is a short markdown string (≤ 1500 chars) describing how this item interacts with the linked items: overlapping requirements, conflicting timelines, sequential compliance dependencies, or operational coupling. Sourced; cite the linked items inline by title.

When no intersections were identified, emit empty array for `related_items` and null for `intersection_summary`. That's the honest answer for a standalone item.

## Intersection Detection (system feature)

Intersection detection is the platform's headline capability and the reason the four intersection-readiness fields exist. It surfaces non-obvious couplings between regulations, technologies, market signals, and research findings — proactively, without the user having to ask "does X interact with Y."

The agent's job in the brief contract is to populate the four fields with grounded, sourced content. The system's job — which runs offline of the agent and does not consume API spend — is to compute pairwise intersections from those tags and rank them. Both halves matter: tags without detection are inert metadata; detection without disciplined tags produces noise.

### What counts as an intersection

Two items A and B intersect when:

1. They share at least one `operational_scenario_tag`, AND
2. They share at least one NON-ROLE `compliance_object_tag` (role tags such as `freight-forwarder`, `shipper` and `carrier-*` are near-universal identity, not grouping, and never count toward this side or its strength, per ADR-021), AND
3. Both items are not archived

The result is stored on the pair's edge in the persisted connection graph (`item_cross_references`) as an `intersection` basis entry carrying the shared scenarios, shared objects, strength and tier, computed by `src/lib/connections/intersections.mjs` in the analyze-corpus pass and read back through `src/lib/connections/pair-view.mjs`; it is not recomputed at read time.

Sharing only a topic_tag does not constitute an intersection. The platform deliberately requires both axes — operational scenario AND compliance object — because real intersections involve the same physical operation imposing duties on the same supply-chain entity. A regulation about ocean fueling and a regulation about supplier ESG reporting both touch "freight-forwarder" but if their operational scenarios don't overlap, they aren't structurally coupled.

### Strength scoring

Each intersection pair receives a strength score that ranks display order. The score is computed deterministically from the tag overlaps and metadata:

- +3 points per shared `operational_scenario_tag`
- +2 points per shared `compliance_object_tag`
- +5 points if A explicitly lists B in `related_items` (or B lists A) — explicit linkage by the agent during composition
- +2 points if both A and B carry priority CRITICAL or HIGH (the regulator-attention bonus)

Strength tiers, by convention:

- Strong (≥12): multiple shared scenarios + multiple shared compliance objects, often with explicit linkage. These are obvious-once-shown couplings the user should see first.
- Medium (8-11): some shared scenarios + compliance objects. Worth surfacing but require reader judgment.
- Weak (<8): limited overlap. Many of these are "common universe" pairs (e.g. both items touch `freight-forwarder` and `emissions-reporting-Scope3`) — surface only when filters call for them.

### Canonicalization

Pairs are canonicalized so each intersection appears exactly once: A.id < B.id ordering. The system never shows the same pair twice with sides swapped. This matters at scale — an intersection-rich corpus of 150 items produces n²/2 = ~11k candidate pairs, of which strength≥7 typically yields hundreds.

### Agent's role: produce tags that join

The agent's discipline in tag emission directly determines intersection signal quality. Three rules the agent should internalize:

1. **Use the core glossary first.** Two items emitting `vessel-CII-rating` join cleanly. Two items where one emits `vessel-CII-rating` and the other emits `cii-rating-vessels` (paraphrase) never join. The vocabulary's job is to make joining mechanical.

2. **Tag what the brief actually covers, not what the item is named.** EU CBAM is named after carbon border adjustment but its substantive content also covers customs declaration import and Scope 3 reporting. Tagging only `CBAM-declaration` would miss the customs and reporting intersections. The agent emits the full set of scenarios the brief substantively addresses.

3. **Populate `related_items` only when grounded.** The agent draws on the AVAILABLE SOURCES pool during composition. If brief composition cited or relied on item B's content, B goes in A's `related_items`. If B was just topically adjacent but didn't inform the brief, leave it out. The integrity rule applies — `related_items` is grounded linkage, not associative speculation.

### The intersection_summary's role

`intersection_summary` is the agent's narrative explanation of how this item interacts with the items in `related_items`. It's the human-readable answer to "why are these two coupled?" When two intersection summaries are surfaced together (one from each side of the pair), they triangulate the relationship from both perspectives.

The summary should:

- Cite linked items by title, not by UUID
- Describe the specific mechanism of coupling (overlapping requirements, conflicting timelines, sequential compliance dependencies, operational coupling)
- Stay grounded — every claim sourced from the items themselves or their cited material

Avoid generic statements like "Both items address sustainability." That's not an intersection; it's a category. An intersection statement names the operational link: "Both impose Scope 3 reporting on the same import flow under different reference periods, creating duplicate-but-not-identical reporting obligations on the same emission units."

### Downstream consumers

The intersection link graph is consumed by:

- The Intersections sub-tab in Source Health Dashboard, ranked by strength with stats banner and threshold filter
- The per-item metadata strip rendered above each brief in detail view, showing both the intersection_summary and the resolved related_items list
- The agent itself on subsequent regenerations: when an item's source pool includes its own related_items, the agent has structured context for cross-regulation reasoning

## 8 Jurisdictions

- eu: European Union (highest regulatory density)
- us: United States (politically volatile, federalism with state divergence)
- uk: United Kingdom (post-Brexit independent track)
- latam: Latin America (Brazil, Chile, emerging packaging and transport rules)
- asia: Asia (China, India, Singapore, South Korea, Hong Kong)
- hk: Hong Kong (special administrative zone)
- meaf: Middle East and Africa (IRENA, green corridor development, bunkering infrastructure)
- global: International bodies (IMO, ICAO, UNFCCC, WTO, ISO, GLEC, GHG Protocol)

## Impact Scoring (4 Dimensions, 0-3 Each)

Cost (0-3): How much does this regulation add to freight pricing? Score 3 if ETS surcharges, SAF mandates, carbon taxes, CBAM certificates. Score 2 if general carbon costs or allowances. Score 1 if indirect cost through carrier investment.

Compliance (0-3): What are the mandatory reporting or documentation requirements? Score 3 if binding regulation with deadlines and penalties and priority HIGH or above. Score 2 if binding regulation or mandatory standard. Score 1 if voluntary but increasingly expected.

Client (0-3): Does this affect client tenders, data requests, or sustainability claims? Score 3 if Scope 3 reporting, CDP, EcoVadis, CSRD, ISSB, GLEC, ISO 14083. Score 2 if compliance-adjacent or rating systems. Score 1 if regulation that clients will ask about.

Operational (0-3): Does this change routing, fleet selection, packaging, or port operations? Score 3 if drayage restrictions, port access rules, packaging mandates, customs changes. Score 2 if fleet or vessel requirements, corridor availability, infrastructure. Score 1 if regulation affecting carrier operations.

## Urgency Scoring

Composite calculation: (total impact across 4 dimensions) x (priority weight) x (time weight) x (jurisdiction weight)

- Priority weights: CRITICAL = 4, HIGH = 3, MODERATE = 2, LOW = 1
- Time weight: 365 / (days to next future milestone), capped at 5
- Jurisdiction weights: EU = 3, US = 2, UK = 2, Global = 3, Asia = 1, LatAm = 1, divided by 3, applied as 0.5 + (jurW x 0.5)

Resources are ranked by urgency score. Transport mode priority (per the workspace profile) is the secondary sort.

## Verification Status

Each resource is cross-referenced to related resources. Verification status computed from link count:

- Verified: 3+ cross-reference links from other tracked resources
- Partial: 1-2 cross-reference links
- Unverified: 0 cross-reference links
- Disputed: has an active dispute record regardless of link count

Disputes contain: a note explaining what is contested, an array of source attributions, and a resolution status. For disputed items, state what is contested, who disagrees, and what the reader should do while the dispute is unresolved.

## Source Type Hierarchy

When encountering conflicting information, weight sources in this order:

1. Binding law and regulation (Official Journal, Federal Register, gazette)
2. Regulator guidance and interpretation (EU Commission FAQ, EPA rule summary)
3. Intergovernmental body position (IMO MEPC summary, ICAO resolution)
4. Industry body interpretation (FIATA, CLECAT, ICCT analysis)
5. News reporting (Reuters, FreightWaves, Lloyd's List)
6. Analysis and opinion (think tanks, academic papers)

Always label source type in output. Never present analysis as regulation. The hierarchy applies to every claim, not just the sources list.

## Priority Source Registry

These are the **current priority-check sources for the update workflow — a starting set the system grows, not a closed list** (the platform also surfaces and registers new priority sources over time per the Operating Principle: creative about WHAT to find, conservative about WHAT to claim). When running updates, check these sources:

- IMO: imo.org/en/mediacentre, imo.org/en/ourwork/environment
- EUR-Lex: eur-lex.europa.eu/oj/daily-view
- EU CLIMA: climate.ec.europa.eu/eu-action/transport-decarbonisation
- CBAM: taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en
- FuelEU: transport.ec.europa.eu/transport-modes/maritime/fueleu-maritime_en
- ReFuelEU: transport.ec.europa.eu/transport-modes/air/refueleu-aviation_en
- EUDR: environment.ec.europa.eu/topics/forests/deforestation/regulation_en
- EPA: epa.gov/regulations-emissions-vehicles-and-engines
- CARB: ww2.arb.ca.gov
- ICAO: icao.int/CORSIA
- UNFCCC: unfccc.int/NDCREG
- World Bank: carbonpricingdashboard.worldbank.org
- EMSA MRV: mrv.emsa.europa.eu
- FIATA: fiata.org
- ICCT: theicct.org/sector/freight
- Smart Freight Centre: smartfreightcentre.org
- GHG Protocol: ghgprotocol.org
- SBTi: sciencebasedtargets.org
- ISSB/IFRS: ifrs.org/sustainability
- EU Council: consilium.europa.eu/en/press/press-releases
- EU Commission: ec.europa.eu/commission/presscorner/home/en
- IEA: iea.org/policies/about
- Climate Laws: climate-laws.org
- Federal Register: federalregister.gov/developers/documentation/api/v1
- Sabin Center: climate.law.columbia.edu
- EEA: eea.europa.eu
- CDP: cdp.net/en/supply-chain
- ISO: iso.org/standard/78864.html
- Maritime Carbon Intelligence: maritimecarbonintelligence.com

Additional Asia and LatAm: flk.npc.gov.cn, egazette.gov.in, sso.agc.gov.sg, elaw.klri.re.kr, gov.br Diario Oficial, bcn.cl/leychile

Industry and research: FreightWaves, GreenBiz, Reuters Sustainable Business, The Loadstar, Splash247, JOC, Lloyd's Register, Getting to Zero Coalition, ZEMBA, First Movers Coalition, E-Fuel Alliance, Mission Innovation, H2 Accelerate, NREL, Project Drawdown

Operator and competitive intelligence sources: Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE, Evergreen, ZIM (vessel and fuel announcements); FedEx, UPS, DHL, Kuehne+Nagel, DB Schenker, DSV, Expeditors (forwarder activity); Lufthansa Cargo, Air France-KLM Cargo, Cargolux, IAG Cargo, Emirates SkyCargo, Qatar Airways Cargo (air cargo activity).
