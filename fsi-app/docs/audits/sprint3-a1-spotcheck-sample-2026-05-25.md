# Sprint 3 A1 — Operator 10% spot-check sample
**Source:** `docs/audits/sprint3-classifier-quality-batch-2026-05-25.json` (474 rows, $0.72 actual cost, 0 errors)
**Sample size:** 47 rows stratified across 4 buckets.
**Goal:** verify Haiku classification quality across each row class. Operator accepts or rejects the batch as a whole.

---
## Spot-check methodology
Sampling: stride-N pick within each bucket (deterministic, evenly spread by id ordering):
- ambiguous_null: 30 of 409 (every ~14th row by sorted id)
- d1_research: 6 of 28 (every ~5th row)
- non_canonical: 6 of 32 (every ~5th row)
- specific_misclass: 5 of 5 (all)

**Known classification axis issue** flagged for operator attention: Haiku sometimes returns format_type values ('technology_profile', 'regulatory_fact_document', 'operations_profile', 'market_signal_brief', 'research_summary') in the `recommended_item_type` field instead of the canonical item_type vocab (regulation/directive/standard/guidance/framework/technology/innovation/tool/regional_data/market_signal/initiative/research_finding). The apply script must guard against this — recommendations with non-canonical item_type values get `item_type: keep current` on apply.

---
## Ambiguous null-category rows (Phase 3D deferral) — 30 of 409

### Singapore Maritime Decarbonisation Blueprint Implementation Regulations
- **ID:** `007104ed-b4e4-4735-b7ac-c16bc214c1eb`
- **Current:** category=`null` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`corridors` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** high
- **Rationale:** The document's core focus is green shipping corridors, cleaner fuel requirements on designated routes, and port sustainability incentives—all hallmarks of corridor policy.

### Slovak Ministry of Environment - Public Infrastructure and Waste Management Initiatives (April-May 2026)
- **ID:** `0ab2a460-7be7-48df-ba5b-ac7d69573d73`
- **Current:** category=`null` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`packaging` · domain=`3` · item_type=`operations_profile`
- **Confidence:** medium
- **Rationale:** Municipal waste management and waste-to-energy facility approvals are core to circular economy and packaging/waste infrastructure policy in the EU context.

### Canada Gazette Website Planned Maintenance - Cloud Migration Notice
- **ID:** `128a1148-4c73-409e-a134-aace730b31ce`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`null` · domain=`5` · item_type=`(keep)`
- **Confidence:** high
- **Rationale:** This is a technical maintenance notice about a government website infrastructure change, not freight sustainability intelligence.

### SEMARNAT Challenge Validation Process
- **ID:** `1e486df0-0c89-43b1-b386-77de6a3ad6c4`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`customs` · domain=`1` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** SEMARNAT challenge validation procedures relate to cross-border environmental compliance verification and regulatory administrative processes typical of customs border procedures.

### South Australian Parliament Portal - Legislative Calendar and Committee Submissions
- **ID:** `259082d3-8493-4931-8f51-e64b93085c96`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`null` · domain=`1` · item_type=`guidance`
- **Confidence:** low
- **Rationale:** Item describes a legislative portal and committee submission process with no specific freight sustainability, transport, or logistics content.

### CleanTechnica Clean Tech News Roundup - May 2026: Offshore Wind Infrastructure Gaps, EV Market Expansion, and Energy Transition Updates
- **ID:** `2b7bbd3a-d479-44c4-8341-72c82c1eff3d`
- **Current:** category=`null` · domain=`4` · item_type=`market_signal`
- **Recommended:** category=`transport` · domain=`4` · item_type=`market_signal_brief`
- **Confidence:** high
- **Rationale:** The brief is primarily about EV market expansion and vehicle launches, which are core transport sustainability topics, while wind infrastructure is secondary context.

### Governor Pulaali I Nikolao Proclaims April 2025 as World Autism Acceptance Month
- **ID:** `3105da5c-0afd-403c-98c5-4099a9e14beb`
- **Current:** category=`null` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`null` · domain=`(keep)` · item_type=`(keep)`
- **Confidence:** high
- **Rationale:** Gubernatorial proclamation on autism awareness is outside the scope of freight sustainability intelligence.

### Hrvatski Sabor Official Portal - Parliamentary Sessions and Legislation Access
- **ID:** `3a8fbb7a-76c4-4f02-9a81-c0679b03744b`
- **Current:** category=`null` · domain=`1` · item_type=`framework`
- **Recommended:** category=`null` · domain=`1` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** This is a legislative portal infrastructure item without substantive freight sustainability content; it is a source access tool rather than a specific regulation, directive, or framework document.

### Naturvårdsverket Cookie and Data Processing Policy
- **ID:** `41dcbf7b-c4d1-4298-9453-73f7e91fc557`
- **Current:** category=`null` · domain=`2` · item_type=`technology`
- **Recommended:** category=`digital` · domain=`1` · item_type=`guidance`
- **Confidence:** high
- **Rationale:** This is a regulatory compliance document from a government agency covering data processing and privacy policy, which falls under digital compliance and data governance.

### The Energy Efficiency (Private Rented Property) (England and Wales) Regulations 2015
- **ID:** `474ab4cd-c157-4451-8c7f-f9c9ab0015b6`
- **Current:** category=`null` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`transport` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** low
- **Rationale:** This regulation concerns residential property efficiency, not freight or logistics, and falls outside the 21 canonical topics for a freight sustainability platform.

### Joint Office of Energy and Transportation: Industry Alignment for EV Charging and Refueling Infrastructure
- **ID:** `537b8131-280b-47c8-b9fe-5a96070917b7`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`transport` · domain=`1` · item_type=`guidance`
- **Confidence:** high
- **Rationale:** Federal guidance on EV charging infrastructure standards, funding, and compliance directly addresses vehicle standards and transport infrastructure deployment.

### Louisiana State Freight Plan 2024 and Commodity Flow Dashboard
- **ID:** `595117e9-a35f-414c-8182-53ef5b34c647`
- **Current:** category=`null` · domain=`1` · item_type=`framework`
- **Recommended:** category=`infrastructure` · domain=`3` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** This is a state-level freight infrastructure plan with commodity flow data specific to Louisiana regions, not a binding regulation but operational guidance on multimodal capacity and supply chain resilience.

### CalSTA Issues Fraud Alert: SB 125 Transit Program Scam Warning
- **ID:** `60bccf36-f7c1-43d1-9a7d-409d56d67af1`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`null` · domain=`1` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** This is a public fraud alert from a state agency about scam prevention, which does not fit the 21 freight sustainability topics; it is operational security guidance but outside the scope of a freight sustainability platform.

### ADB Celebrates 30-Year Europe Partnership, Signals Private Sector Investment Opportunities in Asian Transport
- **ID:** `67c6e313-e501-48ec-82be-944296aad8db`
- **Current:** category=`null` · domain=`4` · item_type=`market_signal`
- **Recommended:** category=`infrastructure` · domain=`4` · item_type=`market_signal_brief`
- **Confidence:** medium
- **Rationale:** ADB's partnership announcement signals emerging private investment opportunities in Asian transport infrastructure, relevant to freight corridor and port development finance.

### Hong Kong Legislative Council Official Portal and Legislative Information Hub
- **ID:** `6bc41d0a-9961-4527-9a71-f413ce29992f`
- **Current:** category=`null` · domain=`1` · item_type=`framework`
- **Recommended:** category=`null` · domain=`5` · item_type=`(keep)`
- **Confidence:** medium
- **Rationale:** This is a meta-source portal (legislative registry) rather than substantive regulatory content; domain 5 (Source Intel) is appropriate for cataloguing information infrastructure.

### LADBS May 2026 Newsletter and LEA/CWS DTLA Public Notices
- **ID:** `77b2b073-25c4-4d4a-b69d-d51574f2529d`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`infrastructure` · domain=`3` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** LADBS newsletters and public notices are primarily operational guidance for Downtown LA building/water infrastructure projects, making this regional operations data rather than binding regulatory framework.

### Former Monsanto/Solutia/Ascend Facility Site - Ongoing Environmental Remediation in South Carolina
- **ID:** `7e43c296-063c-4b21-813a-460379bd2dbe`
- **Current:** category=`null` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`infrastructure` · domain=`3` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** This is facility-specific operational data about an industrial site undergoing environmental remediation, relevant to port/facility regulatory compliance and operational risk.

### IPCC Opens Second-Order Draft Review for Special Report on Climate Change and Cities (March 2027 Release)
- **ID:** `85a7a629-744d-4e59-9b9a-959cf76e5226`
- **Current:** category=`null` · domain=`1` · item_type=`directive`
- **Recommended:** category=`research` · domain=`7` · item_type=`research_finding`
- **Confidence:** high
- **Rationale:** This is an IPCC scientific assessment and policy guidance document in its drafting phase, representing academic/think-tank research output rather than binding regulation.

### IMO 2018 GHG Strategy
- **ID:** `8d18eda9-817f-496a-890e-42386c1ffb1d`
- **Current:** category=`null` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`emissions` · domain=`1` · item_type=`regulation`
- **Confidence:** high
- **Rationale:** IMO's GHG Strategy is a binding international regulatory framework establishing mandatory GHG reduction targets for maritime shipping.

### Climate Change Laws of the World: Comprehensive Global Climate Policy Database and Search Tool
- **ID:** `96050141-ed4a-466f-9fac-0b14c1658bdd`
- **Current:** category=`null` · domain=`4` · item_type=`framework`
- **Recommended:** category=`reporting` · domain=`7` · item_type=`research_summary`
- **Confidence:** high
- **Rationale:** This is a comprehensive academic/policy database and search tool tracking climate laws and NDC implementations globally, functioning as a research intelligence platform rather than a binding regulation or geopolitical signal.

### Polish Chief Environmental Inspectorate (GIOŚ) - Environmental Monitoring and Waste Management Framework
- **ID:** `9e70b75b-48be-405e-9c1f-41f7c3b5538b`
- **Current:** category=`null` · domain=`1` · item_type=`framework`
- **Recommended:** category=`packaging` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** high
- **Rationale:** GIOŚ is Poland's environmental regulator; the summary emphasizes plastic waste export regulations (effective 2026) and waste management oversight, which are core to circular economy and packaging regulation frameworks.

### Iowa DNR Air Quality Programs and Compliance Monitoring Dashboard
- **ID:** `a7d9bc29-1514-4ee9-9177-a4408426498c`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`reporting` · domain=`1` · item_type=`guidance`
- **Confidence:** high
- **Rationale:** Iowa DNR portal provides emissions inventory submission requirements and compliance monitoring procedures, which are reporting and disclosure obligations under air quality regulations.

### Estonia's Climate Ministry Strategic Initiatives: Energy, Environmental Protection, and Infrastructure Updates (April-May 2026)
- **ID:** `b43662a4-70c2-451d-9420-07f2978e427e`
- **Current:** category=`null` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`emissions` · domain=`1` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** The brief centers on Estonia's climate ministry strategic announcements spanning renewable energy support, electricity market reform, and marine protection—primarily emissions and energy decarbonization policy rather than a single binding regulation.

### India's National Logistics Policy Carbon Intensity Standards
- **ID:** `beae0a7e-1088-4d35-b89f-362aade1d1a8`
- **Current:** category=`null` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`emissions` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** high
- **Rationale:** India's mandatory carbon intensity reduction targets for logistics operators are binding regulatory requirements with enforcement mechanisms, clearly falling under emissions policy.

### Nevada Division of Environmental Protection - Comprehensive Environmental Regulatory Framework and Permitting Portal
- **ID:** `c5f34b7e-738c-4df3-9363-a14dda60cbe2`
- **Current:** category=`null` · domain=`1` · item_type=`framework`
- **Recommended:** category=`infrastructure` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** high
- **Rationale:** NDEP portal governs state-level environmental permitting and compliance for air, water, and infrastructure—core to the infrastructure category within a regulatory domain.

### Île-de-France Regional Government Portal - Public Services and Regional Initiatives
- **ID:** `cc9662dc-5823-4887-b22f-489ee019980d`
- **Current:** category=`null` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`null` · domain=`3` · item_type=`operations_profile`
- **Confidence:** medium
- **Rationale:** This is a regional government portal homepage that aggregates public services and initiatives; it is operational/informational in nature rather than a specific freight sustainability intelligence item.

### Louisiana Department of Environmental Quality - Comprehensive Environmental Regulation and Compliance Portal
- **ID:** `d1a333dd-ece2-41e9-984b-7c6e6a3e4434`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`infrastructure` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** high
- **Rationale:** LDEQ portal is a state regulator's compliance and permitting hub covering port/facility environmental standards, making it primarily an infrastructure regulatory resource.

### IEA Data and Statistics Explorer Platform
- **ID:** `d8305603-0aaf-4dcf-b6be-8b2d5d9fec19`
- **Current:** category=`null` · domain=`7` · item_type=`tool`
- **Recommended:** category=`research` · domain=`7` · item_type=`technology`
- **Confidence:** high
- **Rationale:** IEA's data explorer is a research and analytics platform providing global energy statistics, foundational to freight sustainability intelligence.

### EIA Spot Prices for Crude Oil and Petroleum Products - Daily Data
- **ID:** `de368414-d5bd-4fff-a90c-9ce8ba312fe2`
- **Current:** category=`null` · domain=`4` · item_type=`market_signal`
- **Recommended:** category=`fuels` · domain=`3` · item_type=`regional_data`
- **Confidence:** high
- **Rationale:** EIA spot price data is operational fuel cost intelligence for freight planning, not geopolitical signal; domain should be Regional Ops (operational inputs for energy cost modeling).

### RIVM Public Health Updates: Hantavirus Cases, Cruise Ship Evacuation, and Environmental Health Monitoring
- **ID:** `e5c30c9a-6e73-44b6-9e46-7150ca63d4d6`
- **Current:** category=`null` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`null` · domain=`3` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** This is operational public health intelligence (hantavirus alerts, cruise ship incident, environmental monitoring data) from a national health authority, not binding regulation or framework guidance.

## domain=1 AND category='research' rows (cross-axis misalignment) — 6 of 28

### Transportation Research Part E
- **ID:** `0d59991d-2c66-44f5-bcb8-713e8cd03b3a`
- **Current:** category=`research` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`research` · domain=`7` · item_type=`research_summary`
- **Confidence:** high
- **Rationale:** A peer-reviewed academic journal belongs in Research Pipeline domain with research_summary item type, not in Regulations.

### White Paper on Land, Infrastructure, Transport and Tourism in Japan - MLIT Policy Repository
- **ID:** `22d0883e-3101-4d48-a277-e2e2ff920452`
- **Current:** category=`research` · domain=`1` · item_type=`directive`
- **Recommended:** category=`transport` · domain=`1` · item_type=`guidance`
- **Confidence:** high
- **Rationale:** MLIT White Papers are official Japanese government policy guidance on transport and infrastructure, not academic research or directives.

### OECD ITF Decarbonising Transport Initiative
- **ID:** `45006684-2f39-4107-934a-e8420c7fbbbb`
- **Current:** category=`research` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`emissions` · domain=`7` · item_type=`research_finding`
- **Confidence:** medium
- **Rationale:** OECD ITF decarbonising transport content is primarily emissions-focused strategic research rather than binding regulation, and belongs in the research pipeline domain despite current domain assignment.

### ITF-OECD Automated and Autonomous Driving Resource
- **ID:** `605a2d06-80e5-4645-82d1-58ec57fc81d0`
- **Current:** category=`research` · domain=`1` · item_type=`guidance`
- **Recommended:** category=`transport` · domain=`7` · item_type=`research_finding`
- **Confidence:** medium
- **Rationale:** ITF-OECD automated driving content is a research/think-tank resource on vehicle technology standards, best classified as transport research rather than regulatory guidance, and belongs in the research pipeline domain.

### Project Drawdown
- **ID:** `8e1ce829-3a35-4105-a75b-33ca2e3e1e57`
- **Current:** category=`research` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`research` · domain=`7` · item_type=`research_finding`
- **Confidence:** high
- **Rationale:** Project Drawdown is an independent research organization ranking climate solutions with quantified impacts, not a regulatory document or binding framework.

### IDB Sustainable LatAm Transport
- **ID:** `b680a0b8-239c-4556-b627-aebddbbfae60`
- **Current:** category=`research` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`corridors` · domain=`4` · item_type=`market_signal_brief`
- **Confidence:** high
- **Rationale:** IDB funding for green freight corridors is a geopolitical/development finance initiative, not a regulation or research finding.

## Non-canonical category rows (NOT IN TOPICS taxonomy) — 6 of 32

### Brazil Regional Operations Profile
- **ID:** `053123bc-2c11-45ec-a5a1-83828b666b11`
- **Current:** category=`regional` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`packaging` · domain=`3` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** PNRS is Brazil's national reverse logistics and packaging regulation; the primary subject is packaging policy, not generic regional operations.

### UK MEES — Commercial Building Minimum Energy Efficiency
- **ID:** `1c7374d0-01c0-487c-b841-34ac8e336cb4`
- **Current:** category=`facility` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`transport` · domain=`1` · item_type=`regulatory_fact_document`
- **Confidence:** medium
- **Rationale:** MEES is a building energy regulation, but its operational impact on freight operations (warehouse logistics, facility uptime, cost pass-through) makes it primarily a transport infrastructure compliance issue rather than a facility-specific operational fact.

### Trade Restrictions & Industrial Policy
- **ID:** `5ea46db2-00e5-4eda-90d1-11f7e97ec4db`
- **Current:** category=`trade-policy` · domain=`4` · item_type=`market_signal`
- **Recommended:** category=`trade` · domain=`4` · item_type=`market_signal_brief`
- **Confidence:** high
- **Rationale:** EU tariffs on Chinese EVs and batteries are a direct trade policy signal with geopolitical implications for freight sustainability markets.

### Solar & Battery Energy Storage for Warehouses
- **ID:** `6f39b6b9-8f6f-4d92-abc4-ba1f763a572c`
- **Current:** category=`technology` · domain=`2` · item_type=`technology`
- **Recommended:** category=`transport` · domain=`2` · item_type=`technology_profile`
- **Confidence:** medium
- **Rationale:** While focused on warehouse energy, solar/BESS systems reduce operational emissions in logistics facilities and support sustainable freight infrastructure.

### Warehouse Solar & BESS ROI Analysis
- **ID:** `b88753be-8ed4-4392-9cee-9f472c208513`
- **Current:** category=`facility` · domain=`7` · item_type=`research_finding`
- **Recommended:** category=`null` · domain=`6` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** This is facility-specific operational and financial data (solar ROI, LCOE for a warehouse site), not a research finding; domain 6 (Facilities) is appropriate for site-level capex/opex analysis.

### Industrial Electricity Tariff Benchmarks by Jurisdiction
- **ID:** `d2b343b4-334d-401e-b93c-962bd8ac9932`
- **Current:** category=`facility` · domain=`3` · item_type=`regional_data`
- **Recommended:** category=`null` · domain=`3` · item_type=`operations_profile`
- **Confidence:** high
- **Rationale:** Industrial electricity tariff data is operational benchmark information specific to regional markets, not a topic in the 21-category canon; domain and item_type are correct.

## Specific surfaced misclassifications (Green Corridors / UNDP / EcoVadis) — 5 of 5

### EcoVadis: Enterprise Sustainability Intelligence and Ratings Platform Overview
- **ID:** `05b786f8-8753-4e81-923e-ee9d76c56609`
- **Current:** category=`reporting` · domain=`2` · item_type=`tool`
- **Recommended:** category=`reporting` · domain=`2` · item_type=`technology_profile`
- **Confidence:** high
- **Rationale:** EcoVadis is a vendor platform delivering sustainability ratings and compliance tooling; this is a technology offering, not a regulatory document or research finding.

### EcoVadis
- **ID:** `19f08fcc-5f81-44cc-b3db-fe25f1717845`
- **Current:** category=`reporting` · domain=`2` · item_type=`tool`
- **Recommended:** category=`reporting` · domain=`2` · item_type=`technology_profile`
- **Confidence:** high
- **Rationale:** EcoVadis is a sustainability rating platform used for supplier disclosure and assessment; category reporting and domain 2 (vendor tool offering) are correct, but item_type should be technology_profile not generic tool.

### EcoVadis Blog
- **ID:** `52eadc84-b3ea-4a80-8173-30b7d5435d4f`
- **Current:** category=`research` · domain=`4` · item_type=`market_signal`
- **Recommended:** category=`reporting` · domain=`2` · item_type=`guidance`
- **Confidence:** medium
- **Rationale:** EcoVadis publishes methodology and regulatory guidance on ESG reporting standards and supply chain disclosure frameworks, not geopolitical market signals.

### EcoVadis Sustainability Platform: Comprehensive ESG & Supply Chain Compliance Solution
- **ID:** `8107ba33-30e8-4e73-bee2-dd967f995114`
- **Current:** category=`reporting` · domain=`2` · item_type=`tool`
- **Recommended:** category=`reporting` · domain=`2` · item_type=`technology_profile`
- **Confidence:** high
- **Rationale:** EcoVadis is a vendor SaaS platform for ESG disclosure and compliance management; category and domain are correct, but item_type should reflect it as a technology offering rather than generic 'tool'.

### Getting to Zero: Green Corridors
- **ID:** `831f9e63-42a9-4546-9bc6-281e04cea4f6`
- **Current:** category=`corridors` · domain=`1` · item_type=`regulation`
- **Recommended:** category=`corridors` · domain=`4` · item_type=`market_signal_brief`
- **Confidence:** high
- **Rationale:** This is a directory of established green shipping corridor initiatives, a geopolitical and market signal reflecting multi-stakeholder adoption, not a binding regulation.

---
## Operator verdict required

Three responses accepted:
1. **Accept batch as-is** — proceed with apply (per-row-class atomic commits + cross-surface count reconciliation per dispatch brief).
2. **Accept with item_type guard** — apply but ignore Haiku item_type recommendations where the value is non-canonical (format_type leakage). This is the recommended option; the apply script is already wired for this.
3. **Reject batch** — surfaced issues require prompt revision and re-run.

If accepted, apply runs as separate atomic commits per row-class:
- Commit A: category-only changes (1 per row where only category differs)
- Commit B: domain changes (where domain shifts)
- Commit C: item_type changes (where item_type shifts AND value is canonical)

After apply, cross-surface count reconciliation runs per Phase 2A pattern; deltas surfaced before A1 considered green.
