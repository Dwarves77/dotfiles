## The Five Customer-Facing Surfaces

The four intelligence pages map to the source-category taxonomy in `environmental-policy-and-innovation` (the canonical source for the mapping; do not duplicate the taxonomy here, cite it). The fifth surface (Community) is co-equal.

### REGULATIONS

**Scope.** Binding regulatory intelligence. Laws, agency rules, court decisions, treaties, and rulemaking outcomes affecting freight operations across air, road, ocean, rail modes. Includes regulatory deadlines, enforcement dates, comment periods, and binding compliance requirements.

**Analysis contract (RULED 2026-07-12).** Regulations is the ONLY page whose read is a COMPLIANCE-ACTION TEXT brief — what is binding, when, what it costs, what to do. Not comparative/numerical. One generic analysis path serving all pages is forbidden. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping** (per environmental-policy-and-innovation `item_type` and `format_type` derivation). Regulations surfaces items of `item_type` in (`regulation`, `directive`, `standard`, `guidance`, `framework`), formatted as Regulatory Fact Documents (14 sections, conditional).

**Current state.** Functional. The only intelligence page currently delivering its stated intent.

### MARKET INTEL

**Scope.** Industry signals and what the industry is doing. Corporate announcements (vendor claims, capital flows, technology deployment signals, supplier shifts, capacity changes), commercial research output (BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1), cross-cutting sustainability trade press (ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch), carbon market intelligence, fuel pricing signals, predictive timing on market movements.

Cross-references Regulations to surface signals like "regulatory deadline approaching," but the deadline content itself lives in Regulations. Example: BYD announcing a battery advancement is Market Intel. The CBAM 2026 enforcement deadline is Regulations; Market Intel may surface a "CBAM enforcement window closing" signal that links back to the Regulations entry.

**Analysis contract (RULED 2026-07-12).** Market Intel reads are COMPARATIVE / NUMERICAL — deltas, trajectories, lead-time against competitors and adjacent industries — not a compliance-action text brief. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `market_signal`, `initiative` (Market Signal Brief format) plus corporate-press records.

**Current state.** Broken. Alerts SideCard is non-interactive (OBS-18), EmptyState exposes worker-language to end users (OBS-20), taxonomy bleed because `/market` and `/operations` share the same unfiltered payload (per alignment audit Section B), no real signal aggregation engine running.

### RESEARCH

**Page intent (RULED 2026-07-12).** Research answers the operator question: *what is emerging, who is studying it, how does it change my planning horizon.* This is horizon-scan by construction. Research IS the customer-facing horizon-scan destination; its feedstock is AUTONOMOUS intake from research-role sources (universities, academic journals, institutes, analytical/horizon-scan press) — machine-ingested, not editor-selected. An editorial / curation / draft-staging QUEUE on Research is REJECTED (intent-drift + a no-human-finish-of-intake / RD-20 violation). Doctrine register: `research-is-horizon-scan`.

**Scope.** Horizon-scan content with analytical or quantitative depth. Includes:

- Peer-reviewed academic journals (Journal of Sustainable Transportation, transport research journals)
- Think-tanks and policy analysis (IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust)
- Quantified climate research (Project Drawdown)
- Industry analytical press with named editorial provenance (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital)
- Reuters Sustainable Business analytical reporting (distinct from the trade-press Sustainable Switch newsletter which lives in Market Intel)

Research is BROADER than peer-reviewed academic. The discriminator is analytical and horizon-scanning depth, not academic publication form.

**Analysis contract (RULED 2026-07-12).** Research reads are STRUCTURED HORIZON ASSESSMENTS — horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift — NOT paper summaries. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `research_finding` (Research Summary format, 6 sections); some `technology`, `innovation`, `tool` items (Technology Profile format) also surface here when the substance is horizon-scan rather than market-signal.

**Current state.** Broken. Currently functioning as an editorial draft-staging queue for Regulations content rather than as a horizon-scan destination. The `publishedThisWeek` callout titles render as `<b>` text without Links. No live ingest pipeline producing Research Summary briefs from the analytical-press sources; the sources are registered as legacy resource entries only. Source coverage matrix is a hardcoded placeholder with the tab hidden.

**Positioning — RULED (operator 2026-07-12), decision CLOSED.** Research IS the customer-facing horizon-scan destination; the editorial draft-staging queue is REJECTED (intent-drift + RD-20 no-human-finish-of-intake — an editorial queue makes a human the finish of the Research pipeline). Any editorial draft-staging need moves to admin chrome, never onto the Research surface. Future Research-surface work that introduces curation queues, operator-approval affordances, editor-picked content, or "featured/selected by" framing is a regression against this ruling and RD-20. Doctrine register: `research-is-horizon-scan`.

### OPERATIONS

**Scope.** Jurisdictional decision intelligence. Surfaces structured content across:

- Regulatory feasibility by region (which regulations apply where, with what enforcement)
- Regional resource availability (materials, recyclables, qualified suppliers)
- Labor markets (regional wage data, workforce availability)
- Materials sourcing (regional supplier base, qualified mills)
- Infrastructure capacity (ports, rail, terminals, charging)
- Operational cost data (electricity, diesel, SAF, port handling, drayage)

Examples of decisions Operations supports:

- HVAC monitoring system cost, with the regional labour and energy cost evidence shown as sourced figures
- Cross-regional efficiency and cost comparison
- Recyclable materials availability by region (materials sourcing)
- PPWR packaging compliance feasibility by region given material supply (regulatory feasibility integrated with regional resources)
- On-site solar versus grid supply across regions

**Build framing (binding).** Operations surfaces structured content. The customer reads the content and uses the Intelligence Assistant for cross-cutting questions during research. Synthesis happens through structured content plus Assistant plus customer judgment, NOT through a separate decision-engine UI. Operations is a content build, not a synthesis-engine build. Anyone scoping Operations as a separate "cross-functional decision engine UI" build is scoping wrong; this is the framing that the prior version of this skill propagated and that the alignment audit absorbed.

**Analysis contract (RULED 2026-07-12).** Operations reads are STRUCTURED JURISDICTIONAL DATA SURFACES: comparative/numerical regional intelligence (feasibility, cost, labor, materials, infrastructure) for the reader's own cost, labour and infrastructure decisions, with no verdict on automating versus hiring (ADR-043); not a text brief. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `regional_data` (Operations Profile format, 8 sections) plus cross-references from `regulatory` and `market_news` items.

**Current state.** Broken. Stub gallery with regex chip matchers (Solar, Electricity, Labor, EV Charging, Green Building) that mis-attribute wiring gaps as coverage gaps (OBS-19). Phase-language banner "Coming soon, Phase D" leaked to customers (anti-pattern; see Section 11). No real content for most jurisdictions.

### COMMUNITY

**Scope.** Peer information-sharing across organizations and client cohorts to address freight industry information isolation. CORE value surface, equal status with the four intelligence pages. The freight industry has a structural problem: professionals and clients in different geographies duplicate efforts because they do not know what others are doing. Community is the peer resource that fixes this.

**Components currently shipped** (per Multi-Tenant Foundation Workstream B, 2026-05-15):

- Private working groups (org-scoped or cross-org peer collaboration spaces)
- Public forums (open discussion threads)
- Promote-to-public workflow (private content can be promoted to public discussion)

**Rule (ADR-041, operator ruling 2026-10-03, verbatim in substance):** Community is a social place, not a source of information. System to Community links are allowed (a member may link a regulation or item from the system into a discussion). No Community-derived content, count, state or aggregate may appear on, or feed, any page or pipeline outside `/community` and its own API. There is no editorial pickup and no promotion.

**Removed from scope** (operator-stated correction 2026-05-24):

- Vendor directory. No longer part of the platform. Any prior dispatch report or follow-up that scoped vendor directory expansion is superseded.

**Source category mapping.** Community does NOT map to the four-category source taxonomy. Community content is user-generated peer discussion only; it is not classifier output from external sources. The two halves of the platform (intelligence and community) are structurally distinct in this respect.

**Current state.** Partially functional. Working groups, forums, and promote-to-public (a repost inside Community) shipped per Workstream B. Editorial pickup and promotion into other surfaces are retired (ADR-041). Gaps: author-identity rendering (org + role + sector + region), region/group structure on the index page, AI prompt bar wiring, topic-by-region matrix, sector-taxonomy-driven group seeding for new workspaces.
