---
name: environmental-policy-and-innovation
description: Generate weekly updates on current policy and innovation within the environmental sector that pertains to international freight forwarding on land, air, and sea. Continually update the sources to provide the most accurate and relevant information.
---

# Sustainability Intelligence Skill for Freight Forwarding

This skill operates as an evidence-grounded, continuously refreshed policy intelligence system for a global freight forwarding company. It covers carbon pricing, fuel mandates, transport-emissions measurement, trade-embedded climate instruments, and domestic regulatory shifts across the Americas, Europe, and Asia.

---

## Operational Pressure Zones

A freight forwarder's sustainability and compliance exposure is shaped by fast-moving policy in four areas:

1. **Carbon pricing and fuel mandates** — Ocean shipping (EU ETS maritime, FuelEU Maritime) and aviation (ReFuelEU Aviation, CORSIA SAF mandates)
2. **Transport-emissions measurement** — Rules affecting customer reporting, tenders, and Scope 3 accounting (ISO 14083, GLEC Framework)
3. **Trade-embedded climate instruments** — Carbon border measures (EU CBAM) intersecting with customs brokerage and routing decisions
4. **Domestic regulatory baselines** — Especially volatile in the U.S. (EPA rule changes, state-level divergence)

### Key Near-Term Anchor Cases

- **EU Maritime ETS** — Extended to maritime emissions from 1 Jan 2024; phased surrender obligation (40% to 70% to 100%) with additional gas scope from 2026
- **FuelEU Maritime** — Applies from 1 Jan 2025; influences fuel procurement, penalties, and carrier green surcharge structures
- **ReFuelEU Aviation** — In force with key provisions from 1 Jan 2025; affects air cargo rates, SAF accounting, and customer emissions reporting
- **U.S. EPA** — Finalized rescission of the 2009 endangerment finding and repealed vehicle GHG standards; U.S. baselines are highly volatile with state-level divergence likely
- **IMO GHG Strategy** — 2023 strategy adopted; net-zero framework combining fuel standard and pricing mechanism advancing, affecting long-horizon maritime compliance

### Assumptions

- The forwarder operates on multiple trade lanes across the Americas, Europe, and Asia
- English-first outputs with selective machine translation for non-English primary sources
- Scheduled ingestion pipeline (at least hourly/daily) with a searchable store for retrieval-augmented generation (RAG)
- Budget/hosting/vendor choices remain open

---

## Three Operating Modes

1. **Daily briefings** — Summarize new and updated items from primary publications and regulator bulletins, optimized for leadership
2. **Regulatory alerts** — Trigger on high-impact events (final rules, OJ publications, major regulator guidance) and translate into freight-forwarding actions (contracts, cost pass-through, data requests to carriers, customer comms, internal controls)
3. **Deep dives** — Create operational playbooks for topics such as EU maritime ETS phase-in, FuelEU Maritime compliance implications for carrier surcharges, SAF mandate exposure under ReFuelEU Aviation, and standardized calculation methods under emerging EU transport-emissions accounting initiatives

---

## Prioritized Source List

Sources are prioritized by: (1) primary legal text publication, (2) authoritative regulator implementation detail, (3) update frequency. Reliability score: 5 = primary official/regulator, 4 = high-quality intergovernmental datasets, 3 = reputable academic/NGO trackers.

### Tier 1: Official Legal Publications and Regulator Pages

| Source | URL | Region | Type | Update Frequency |
|--------|-----|--------|------|-----------------|
| Federal Register / API | https://www.federalregister.gov/developers/documentation/api/v1 | US | Official legal publication + API | Business-daily; API continuous |
| Regulations.gov API | https://open.gsa.gov/api/regulationsgov/ | US | Official docket/search API | Continuous as agencies post |
| U.S. EPA Regulations | https://www.epa.gov/regulations-emissions-vehicles-and-engines | US | Regulator rule and program pages | Ad hoc; high during rulemakings |
| EUR-Lex (Official Journal) | https://eur-lex.europa.eu/oj/daily-view/L-series/default.html | EU | Official Journal + legal text + RSS/API | Daily OJ updates; RSS alerts available |
| Council of the EU Press | https://www.consilium.europa.eu/en/press/press-releases/ | EU | Official political/legal status + RSS | Continuous; RSS feeds available |
| European Commission Press Corner | https://ec.europa.eu/commission/presscorner/home/en | EU | Official policy comms + subscription | Daily/near-daily; email notifications |
| EC DG CLIMA Shipping Pages | https://climate.ec.europa.eu/eu-action/transport-decarbonisation/reducing-emissions-shipping-sector_en | EU | Regulator guidance | Ad hoc; updated as implementation evolves |
| EC CBAM Portal | https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en | EU | Regulator program page | Ad hoc; active during transitional deadlines |
| THETIS-MRV | https://mrv.emsa.europa.eu/ | EU | Reporting system + public data | Continuous; annual reporting cycles |

### Tier 2: Intergovernmental Organizations

| Source | URL | Region | Type | Update Frequency |
|--------|-----|--------|------|-----------------|
| IMO GHG Strategy | https://www.imo.org/en/ourwork/environment/pages/2023-imo-strategy-on-reduction-of-ghg-emissions-from-ships.aspx | Global | Intergovernmental regulator | Ad hoc; spikes around MEPC sessions |
| ICAO CORSIA | https://www.icao.int/CORSIA | Global | Intergovernmental regulator | Ad hoc; periodic updates and newsletters |
| UNFCCC NDC Registry | https://unfccc.int/NDCREG | Global | Intergovernmental commitments registry | Continuous as Parties submit |
| World Bank Carbon Pricing Dashboard | https://carbonpricingdashboard.worldbank.org/ | Global | Intergovernmental dataset | Updated as instruments change |
| IEA Policies and Measures Database | https://www.iea.org/policies/about | Global | Intergovernmental policy database | Regular updates |

### Tier 3: Academic, NGO, and Law Trackers

| Source | URL | Region | Type |
|--------|-----|--------|------|
| Climate Change Laws of the World | https://climate-laws.org/ | Global | Academic/NGO law and policy tracker |
| ECOLEX (FAO/IUCN/UNEP) | https://www.ecolex.org/ | Global | Treaty and legislation aggregator |
| Sabin Center for Climate Change Law | https://climate.law.columbia.edu/ | Global | Litigation and regulatory tracking |
| European Environment Agency | https://www.eea.europa.eu/en/newsroom/news/eu-maritime-transport | EU | Sectoral context and analysis |
| ICCT Freight | https://theicct.org/sector/freight/ | Global | Policy-relevant freight/aviation/fuel analysis |
| International Transport Forum | https://www.itf-oecd.org/decarbonising-transport | Global | Transport decarbonization frameworks |

### Tier 4: Non-English Official Sources (Asia / South America)

| Source | URL | Region | Language |
|--------|-----|--------|----------|
| National Database of Laws and Regulations | https://flk.npc.gov.cn/ | China | Chinese |
| Gazette of India eGazette | https://egazette.gov.in/ | India | English/Hindi |
| Singapore Statutes Online | https://sso.agc.gov.sg/ | Singapore | English |
| Statutes of the Republic of Korea | https://elaw.klri.re.kr/eng_service/main.do | South Korea | English translations |
| Diario Oficial da Uniao | https://www.gov.br/pt-br/servicos/acessar-o-diario-oficial-da-uniao | Brazil | Portuguese |
| Ley Chile | https://www.bcn.cl/leychile/ | Chile | Spanish |

### Tier 5: Standards, Frameworks, and Industry Bodies

| Source | URL | Focus |
|--------|-----|-------|
| ISO 14083 (Transport Emissions) | https://www.iso.org/standard/78864.html | Transport-emissions quantification standard |
| Smart Freight Centre / GLEC Framework | https://www.smartfreightcentre.org/en/our-programs/emissions-accounting/global-logistics-emissions-council/ | Logistics emissions accounting |
| GHG Protocol (Scope 3) | https://ghgprotocol.org/corporate-value-chain-scope-3-standard | Value-chain emissions accounting |
| Science Based Targets (Transport) | https://files.sciencebasedtargets.org/production/files/Land-Transport-Guidance.pdf | Transport target-setting guidance |
| CDP Supply Chain | https://www.cdp.net/en/supply-chain | Supplier emissions data channel |
| IFRS / ISSB Standards | https://www.ifrs.org/sustainability/knowledge-hub/introduction-to-issb-and-ifrs-sustainability-disclosure-standards/ | Sustainability disclosure standards |
| FIATA Sustainability | https://fiata.org/sustainability-is-a-critical-issue-facing-our-world/ | Forwarder-specific guidance |
| IRU Environment | https://www.iru.org/what-we-do/being-trusted-voice-mobility-and-logistics/environment | Road freight sector positions |
| Thomson Reuters Regulatory Intelligence | https://regintel-content.thomsonreuters.com/ | Commercial curated regulatory events |

---

## System Prompt

```
SYSTEM (Claude):

You are the Sustainability & Climate Policy Intelligence Assistant for a global freight forwarding company. Your job is to translate regulatory and policy updates into operational impact, compliance risk, and recommended actions.

Non-negotiables:
- Ground every claim in the provided sources; include citations as URLs for each key statement.
- Distinguish: (a) binding law/regulation, (b) regulator guidance/interpretation, (c) political announcements, (d) analysis/opinion.
- Always extract: jurisdiction(s), affected transport mode(s) (ocean/air/road/rail/warehousing), affected business functions (procurement, pricing, customs brokerage, reporting), deadlines, penalties, and data requirements.
- Provide a clear "What to do now" section and assign suggested owners (e.g., Legal, Sustainability, Ocean Product, Air Product, Customs, Sales).
- If a source is non-English: summarize in English AND preserve the original title and a short quoted excerpt (25 words max) in the original language.
- Never provide legal advice; instead provide compliance-oriented risk flags and recommend consulting counsel for binding interpretation.

Output format (always):
1) Executive summary (5-10 lines)
2) What changed (bullet list, max 8 bullets)
3) Operational impact assessment (structured by transport mode and business function)
4) Compliance risk register (risk, severity: Low/Med/High, likelihood: Low/Med/High, deadline)
5) Recommended actions (prioritized, with owners and timeframes)
6) Open questions / information needed
7) Source list (URLs)
```

---

## User Prompts

### Daily Briefing

```
USER (Daily Briefing):

Using the "last 24 hours" document set, produce a daily sustainability and climate-policy briefing for freight forwarding leadership.

Constraints:
- 1 page equivalent (600-900 words)
- Organize by region: US, EU/UK, Asia, South America, Global (IMO/ICAO/UNFCCC)
- Highlight only items with operational or reputational impact in the next 12 months
- Include a "Top 5 actions" list at the end
- Include a short "Costs & pricing" paragraph: expected pass-through mechanisms (e.g., ETS allowances, fuel mandates, carbon border reporting)
```

### Regulatory Alert

```
USER (Regulatory Alert):

A new item has been detected. Analyze it and generate a regulatory alert.

Input:
- Title, jurisdiction, publication date, document type (final rule / directive / regulation / guidance / consultation)
- Full text or excerpt
- Links to primary sources

Tasks:
- Summarize the change in plain English.
- Identify who is affected: freight forwarder, carriers, shippers, importers/exporters.
- List required actions and deadlines.
- Flag potential greenwashing/claims risk if companies might misstate compliance or emissions.
- Output a JSON block for our ticketing system with: title, severity, jurisdictions, functions, due_dates[], owner_suggestion, and recommended_next_steps[].
```

### Deep Dive

```
USER (Deep Dive):

Produce a deep-dive report on the attached policy package.

Include:
- Background and policy intent
- Key obligations and phased timelines
- Implications for:
  (a) ocean freight procurement and contracts
  (b) air freight procurement and SAF accounting
  (c) customer emissions reporting (Scope 3 / ISO 14083 / GLEC)
  (d) customs and trade processes (e.g., CBAM-like reporting)
- Quantify impacts qualitatively (Low/Med/High) if exact costs are unknown
- Provide a 90-day implementation plan and a 12-24 month roadmap
```

---

## Few-Shot Examples

### Example 1: Regulatory Alert — EU Maritime ETS

**Input:**
- Jurisdiction: EU
- Document type: Official regulator guidance page (shipping ETS implementation)
- Signal: Phase-in of maritime ETS compliance + scope expansion to additional gases starting 2026

**Output:**

**Executive summary:**
EU carbon-cost exposure for ocean freight will rise over the phase-in period; contract clauses and surcharge governance need updates.

**What changed:**
- Maritime emissions are in ETS; surrender obligation phases in (40% to 70% to 100%)
- Additional gases enter scope later; MRV and registry processes matter

**Operational impacts:**

Ocean:
- Carrier cost pass-through likely via ETS surcharges; renegotiate indexation clauses

Customs/Sales:
- Customers will ask for "EU ETS included?" statements; ensure accurate language

Data:
- Require carrier-provided emissions data aligned to voyages/ports

**Risk register:**
- Risk: Under-recovery or double-charging ETS surcharges — High severity, Med likelihood
- Risk: Incorrect emissions claims in tenders — Med severity, Med likelihood

**Recommended actions:**
1. Add "ETS pass-through governance" playbook (Owner: Ocean Product + Finance; 30 days)
2. Update customer-facing FAQ on carbon surcharges (Owner: Sustainability + Sales; 14 days)
3. Refresh carrier data request templates (Owner: Procurement; 30 days)

---

### Example 2: Deep Dive — U.S. EPA GHG Standards Rescission

**Input:**
- Jurisdiction: US
- Document type: Final rule summary (EPA)
- Signal: Rescission of prior greenhouse-gas regulatory basis for vehicles + repeal of GHG standards

**Output:**

**Background:**
The federal baseline for vehicle GHG standards is changing; expect litigation and state divergence.

**Operational impacts:**

Road (drayage/linehaul partners):
- Short-term compliance pressure from federal rules decreases, but state/local rules may tighten independently

Customer reporting:
- Emissions accounting expectations (customers, investors) will not disappear; maintain ISO/GLEC-aligned reporting

**Risk register:**
- Risk: Conflicting state vs federal requirements — High severity, High likelihood
- Risk: Reputational risk if "deregulation" is misused to weaken sustainability claims — Med severity, Med likelihood

**Actions:**
1. Maintain internal emissions standards independent of federal rollback
2. Track state-level developments and update carrier procurement requirements

---

### Example 3: Daily Briefing Item — EU CSRD/CSDDD Simplification

**Input:**
- Jurisdiction: EU
- Document type: Council press release + Official Journal directive number
- Signal: Simplification / narrowing of corporate sustainability reporting and due diligence scope

**Output:**

**Summary:**
Fewer companies may be directly in-scope, but "data pull-through" will remain via customers who still must report.

**Impact:**
- Expect fewer direct legal requests from mid-sized customers, but higher-quality data requests from the largest shippers
- Continue building auditable shipment-level emissions reporting to retain preferred-supplier status

**Actions:**
1. Update customer segmentation: "in-scope reporters" vs "out-of-scope but asked"
2. Align reporting outputs to ISO 14083 / GLEC to reduce bespoke questionnaires

---

## Ingestion Architecture

### Design Principles

Optimize for:
1. **Provenance and defensibility** — Always link back to primary text
2. **Low-latency detection** — Daily/near-real-time for top sources
3. **Domain-specific reasoning** — Freight operations and sustainability accounting
4. **Auditability** — What was seen when, what was recommended, who approved actions

### Component Blueprint

```
Source Registry
  -> Ingestion Workers (API / RSS / Email / Crawl)
    -> Raw Artifact Store (HTML / PDF / XML)
    -> Text Extraction & Normalization
      -> Language Detection + Translation
        -> Metadata + Taxonomy Tagging (jurisdiction, mode, topic)
          -> Delta Detection (versioning + semantic diff)
            -> Event Bus / Queue
              -> Impact Classifier + Routing
                -> Human Triage Console <- Auto-Generated Alert Drafts
                  -> Approved Outputs Store (briefings / alerts / actions)

Text Extraction also feeds:
  -> Search Index (full-text)
  -> Vector Index (embeddings)

Approved Outputs + Search Index + Vector Index feed:
  -> Claude Skill API Layer
    -> Delivery Channels (Slack / Email / Dashboard / Tickets)
```

### Ingestion Methods

| Method | Best For | Pros | Cons | Cadence |
|--------|----------|------|------|---------|
| Official APIs (JSON/XML) | US Federal Register, Regulations.gov, EUR-Lex webservice | High reliability, structured metadata, fine-grained filters | Coverage varies; auth/registration and rate limits | Hourly to daily |
| RSS feeds / email notifications | EU Council press, EUR-Lex alerts, Commission notifications | Low engineering cost, good early warning | Can be noisy; may lack full text | 15-60 min polling |
| Gazette polling + PDF/HTML extraction | Non-English official gazettes, some EU OJ PDFs | Best ground truth for many jurisdictions | Parsing complexity; OCR risk; inconsistent formats | Daily |
| Change-detection crawling (ETag/hash) | Regulator guidance pages lacking feeds | Works where no feeds exist; detects silent edits | False positives from layout changes; must respect robots.txt | Daily |
| Commercial regulatory intelligence | Global mapping, curated change events | Curated delta summaries, taxonomy mapping, global coverage | Cost; black-box risk; must link to primary sources | Per vendor SLA |

### Key API and Feed References

- **FederalRegister.gov API** — Public API; published business-daily (Mon-Fri excluding federal holidays)
- **Regulations.gov API** — GET API for searching documents, comments, and dockets
- **EUR-Lex webservice** — SOAP/XML for querying the EU legal corpus; supports RSS alerts (requires registration)
- **Council of the EU RSS** — https://www.consilium.europa.eu/en/about-site/rss/
- **EUR-Lex predefined RSS** — https://eur-lex.europa.eu/content/help/search/predefined-rss.html
- **Commission notifications** — https://commission.europa.eu/about/contact/press-services/press-releases-and-notifications_en
- **IMO meeting summaries** — https://www.imo.org/en/mediacentre/meetingsummaries/pages/default.aspx

### Suggested Tech Stack (Vendor-Neutral)

- **Ingestion and orchestration** — Python-based workers + workflow scheduler
- **Parsing** — HTML parsing + structured extraction; PDF extraction with fallback OCR (store originals for audit)
- **Storage** — Object storage for artifacts; relational DB for metadata/workflow; search + vector store for retrieval
- **Messaging** — Queue/event bus to decouple ingestion from summarization and alerting
- **Observability** — Metrics for ingestion freshness by source, parser error rate, alert precision/recall, human override frequency
- **Governance** — Immutable audit log of source to summary to decision to action, with timestamps and approver

### Retraining and Tuning Cadence

- **Ingestion rules and parsers** — Update as breakages occur (expect monthly small fixes)
- **Taxonomy and risk rules** — Quarterly revisions aligned to changing regulation themes
- **Prompt set and few-shot library** — Monthly iteration based on observed failure modes and user feedback
- **Evaluation set** — Continuously expanded (add "golden" regulatory events and expected outputs)

### Alert-to-Action Workflow

```
Day 0:     Detect new publication (API/RSS)
           Parse + classify + dedupe
           Generate alert draft (Claude)
           Human triage + severity decision

Day 0-1:   Assign owner + create tickets
Day 1-3:   Gather missing info (carriers/customers)
Day 3-8:   Update SOP/contracts/customer comms
Day 8-9:   Verify implementation + log evidence

Day 9-10:  Post-implementation review + prompt tweaks
```

---

## Regulatory Deep Dive Methodology

When analyzing any piece of legislation, regulation, guidance, or policy relevant to freight forwarding operations, apply this methodology. The PPWR analysis (Regulation EU 2025/40, April 2026) is the reference model for what this output should look like. Every deep dive produces the same structure regardless of regulation, jurisdiction, or transport mode.

---

### Step 1: Source Classification

Before any analysis, classify every claim by its authority level. Never mix these or allow one to be mistaken for another:

- **Confirmed from primary text** — directly quoted or verified against the official legal text
- **Confirmed from official guidance** — from a regulator or intergovernmental body, interpretive but not binding
- **Confirmed from law firm or expert commentary** — secondary source, useful for navigation, not legally authoritative
- **Industry operator interpretation** — practitioner view, for navigation only, not legally authoritative
- **Legal Confirmation Required** — unresolved, cannot be stated as fact, must be referred to legal counsel

Apply these labels throughout every output. Never present an inference as a confirmed fact. Never state regulatory implications as advice. Legal must advise on all compliance implications.

---

### Step 2: What Is This Regulation and Why Does It Apply

State clearly:
- What the regulation governs and what it does not
- Which jurisdictions it applies in and how it is enforced (directly applicable vs. requires national transposition)
- Whether any exemptions exist for specific cargo verticals, and if so, confirm from primary text before stating them
- Which transport modes are affected (air, road, ocean, rail) and in what order of priority
- Who in the supply chain bears obligations: manufacturers, importers, distributors, logistics operators, end users
- Whether a single transaction can place the same company in multiple roles simultaneously

---

### Step 3: Issues Requiring Immediate Action

Separate time-sensitive decisions from planning items. For each immediate issue state:
- What the decision or action is
- Why it cannot wait
- What the consequence of inaction is
- What is currently unresolved (Legal Confirmation Required)
- Who owns the action (Legal, Operations, Commercial, Sustainability)

Surface immediate issues first. Do not bury them inside analytical sections.

---

### Step 4: How the Company Sits in the Compliance Chain

For each affected business entity separately, then for both together:
- What role does the business occupy in the supply chain for this regulation
- What obligations attach to each role
- Where does the legal compliance obligation sit vs. where does the operational consequence land if a third party fails to comply
- What current terms of service or contract structures need to be reviewed

For Dietl and Rockit, always analyze both businesses separately first, then identify shared exposure.

---

### Step 5: Key Provisions Analysis

For each substantive provision:
- State the confirmed requirement in plain language
- Cite the specific article or section from the primary text
- Note the applicable date or deadline
- Identify which packaging formats, cargo types, or operational processes it affects
- Flag any exemptions that may apply, with their conditions and source
- Flag any provisions requiring Legal Confirmation Required before operational decisions are made

Use tables where multiple thresholds, targets, or categories exist. Never describe a table in prose.

---

### Step 6: Format-by-Format or Category-by-Category Analysis

For each affected packaging format, material, product category, or operational type:
- What is the current compliance status
- What changes are required from which date
- What is the legal uncertainty affecting this format (if any)
- What is the commercial risk if the uncertainty resolves unfavorably
- What does this mean for procurement, operations, client communications, or contract terms

For freight forwarding operations, the relevant categories are typically:
- Primary packaging brought into operations by clients
- Transport packaging procured or commissioned by the forwarder
- Client-owned equipment handled by the forwarder as logistics operator
- Materials used internally across all verticals (soft packaging, foam, corrugated)
- Products sold under the forwarder's own name

Adjust these categories to match the sector being analyzed.

---

### Step 7: Third Party and Supply Chain Exposure

Identify parties in the supply chain who are likely unaware of their obligations:
- Suppliers, fabricators, and vendors
- Foreign-based clients shipping into the regulated jurisdiction
- End clients and operators whose equipment or packaging the forwarder handles

For each: what is their obligation, are they likely compliant, what is our exposure if they are not, and what vendor onboarding frameworks, pre-shipment checklists, or contract clauses are needed.

---

### Step 8: Infrastructure and System Gaps

Identify what tracking, reporting, labeling, or documentation infrastructure the regulation requires that does not currently exist. For each gap:
- What does the regulation require
- What does the current baseline look like
- What is the gap between current state and requirement
- What does closing the gap require (system build, process change, training, vendor engagement)
- What is the decision timeline given implementation lead times

---

### Step 9: Alternative Materials or Technology Research Direction

Where the regulation creates procurement pressure (recycled content mandates, recyclability grades, reuse requirements), identify:
- What current materials or formats are at risk of non-compliance
- What alternatives exist and at what stage of development or testing
- What performance constraints apply to the specific cargo type
- What the testing methodology should be
- What the most urgent single research question is

Reference peer-reviewed research and validated industry case studies where available. Distinguish research findings from commercial claims.

---

### Step 10: Confirmed Regulatory Timeline

Produce a chronological table of every confirmed obligation and deadline:
- Date
- Specific obligation in plain language
- Source (primary text article number, or secondary source with explicit caveat)

Separate confirmed obligations from estimated or unconfirmed dates.

---

### Step 11: Sources

List every source with its URL, separated by authority tier:
1. Primary legal text
2. Official regulator guidance documents
3. Law firm commentary
4. Industry operator interpretation
5. Research and academic sources

---

### Applying This Methodology Across All Sectors

This structure does not change regardless of regulation, jurisdiction, sector, or transport mode. What changes is the content within each step.

**Bulk commodity freight:** Step 6 analyzes packaging at the container, tanker, or bulk bag level. Step 4 addresses the commodity trader vs. logistics operator role distinction.

**Cold chain and pharmaceuticals:** Step 6 analyzes temperature-controlled packaging compliance and any medical exemptions. Step 9 addresses validated alternatives for temperature-sensitive goods.

**E-commerce freight:** Step 6 addresses the sales packaging vs. transport packaging distinction for direct-to-consumer shipments. Step 7 addresses marketplace seller obligations vs. fulfillment operator obligations.

**High-value automotive:** Step 6 analyzes protective wrapping, foam dunnage, and custom crating for vehicles. Step 4 addresses whether the logistics operator or consignor bears packaging obligations.

**Live events and touring:** Step 6 analyzes flight cases, road cases, and expendable soft packaging. Step 8 addresses case serialization and rotation tracking infrastructure. Step 9 addresses conservation-performance constraints on alternative materials.

**Fine art and museum logistics:** Step 6 analyzes custom artwork crates, one-way wooden crates, and foam dunnage. Step 9 addresses conservation research on alternative wrapping and cushioning materials.

The depth, precision, source attribution, and legal authority labeling must be consistent across all sectors. The PPWR v7 document is the benchmark for output quality.

---

## Regulatory Deep Dive Methodology

When analyzing any regulation, legislation, or policy for any freight sector or industry, apply this exact methodology. The PPWR v7 analysis produced for Dietl International and Rockit is the benchmark for depth, structure, and operational grounding. Every regulatory deep dive must meet that standard.

---

### Step 1: Establish Authority Hierarchy

Before writing a single analytical statement, classify every source used:

- **Confirmed from primary text** — the actual regulation, directive, or legislation as published in the official gazette (EUR-Lex Official Journal, Federal Register, IMO MEPC resolutions, ICAO Annexes, etc.)
- **Official guidance** — commission guidance, regulatory agency interpretation, implementing acts. Interpretive, not binding. Cite the specific document reference and publication date.
- **Secondary legal sources** — law firm analysis, industry association guidance. Named source only, labeled as such.
- **Industry operator interpretation** — practitioner interpretation for navigation only. Labeled clearly. Never presented as legally authoritative.
- **Legal Confirmation Required** — anything that cannot be confirmed from the above sources and requires legal to advise before action is taken.

Never present an inference as a confirmed fact. Never collapse these categories. If a claim cannot be sourced to one of the first three levels, it must be labeled Legal Confirmation Required or flagged as unconfirmed.

---

### Step 2: Identify Immediate Action Items Before Any Timeline Analysis

The first question is not "what happens in 2030" but "what requires a decision or action now." Regulatory deep dives must surface the immediate pressure points before presenting the compliance timeline. These are items where waiting costs options, not just time.

For each immediate action item, state:
- What is the gap or unresolved question
- Why it requires action now rather than later
- Who must act (legal, operations, procurement, leadership)
- What the consequence is of not acting

---

### Step 3: Map the Compliance Chain for Each Entity

A regulation applies differently depending on where an entity sits in the supply chain. For each entity in scope, determine:

- What role does this entity occupy under the regulation (manufacturer, importer, distributor, logistics operator, producer, end user)?
- Can the entity occupy multiple roles simultaneously depending on the transaction type?
- What obligations attach to each role?
- Where does the compliance obligation sit versus where does the operational consequence land if a third party fails to comply?

Always separate where the legal obligation sits from where the commercial and reputational consequence lands. These are often different parties.

---

### Step 4: Apply the Classification Before Compliance Framework

For any regulation that creates obligations based on whether something qualifies as a defined category, resolve the classification question before designing any compliance program. Building a compliance system for something that may not be in scope wastes resources and may create obligations that did not exist.

The classification before compliance principle:
1. What is the threshold definition under the regulation?
2. Does the specific packaging, operation, cargo type, or entity meet that definition?
3. Are there exemptions, carve-outs, or alternative bases for relief that must be assessed before the definition applies?
4. What is the source authority for each classification position?
5. What confirmation is required from legal before any compliance system build begins?

Document unresolved classification questions explicitly. Do not assume the most conservative interpretation unless legal has advised that is the appropriate position.

---

### Step 5: Produce a Format Analysis for Each Asset or Operation Type

For each distinct packaging format, cargo type, operational mode, or asset category relevant to the entities in scope, analyze separately:

- What is the regulatory status of this specific format or type?
- What confirmed obligations apply?
- What is unresolved and requires legal confirmation?
- What is the compliance risk level and on what timeline?
- What changes regardless of how unresolved questions are answered?

Do not aggregate asset types into a single analysis unless they genuinely share identical regulatory treatment. Flight cases, custom artwork crates, foam dunnage, soft packaging, and cardboard boxes each have distinct treatment under a single regulation. Each must be analyzed separately.

---

### Step 6: Surface the Third Party Exposure

Regulations impose compliance obligations on parties in a supply chain. When a third party fails to comply, the operational consequence often lands on the entity with the client relationship, not the entity with the legal obligation. The deep dive must identify:

- Which third parties (vendors, clients, carriers, fabricators) have obligations they may not be aware of
- What the consequence is for the commissioning entity if a third party fails to comply
- What vendor onboarding, pre-shipment verification, or contract language is needed to manage that exposure

---

### Step 7: Build the Confirmed Timeline with Source Attribution

Every compliance milestone must be attributed to its source and classified by confidence level. Do not list deadlines that cannot be confirmed. Mark industry operator interpretation separately from primary text confirmation.

For each milestone state:
- The date
- The specific obligation
- The source (primary text article, guidance section, implementing act, industry interpretation)
- Whether it is confirmed or pending (e.g., implementing act not yet published)
- Whether it is an obligation on the entities in scope or a regulatory publication obligation

---

### Step 8: Apply the Industry-Specific Lens

Regulations are written for broad application. The operational impact on a fine art logistics operator, a live events touring company, a cold chain pharmaceutical forwarder, and a bulk commodity shipper will differ materially even under the same regulation. The deep dive must translate the regulation into the specific operational context of the industry being analyzed.

For each industry vertical, ask:
- Which of our specific operations, assets, and cargo types are in scope?
- Which are potentially exempt and on what basis?
- Where does the compliance burden fall on us versus on our clients?
- What is the timeline pressure given our specific procurement, operational, and vendor cycles?
- What are we doing today that creates exposure?

The PPWR analysis for Dietl and Rockit is the model for this translation. The same methodology applies to a cold chain operator analyzing FuelEU Maritime, a live events forwarder analyzing CORSIA, or a pharmaceutical freight forwarder analyzing EU CBAM.

---

### Step 9: Alternative and Innovation Intelligence

Where a regulation creates a compliance problem that requires substitution or investment, identify the current state of alternative solutions:

- What alternatives exist today that have been tested against the performance requirements of this industry?
- What is the conservation, operational, or safety performance of each alternative versus the current standard?
- What is the PPWR or regulatory compliance status of each alternative?
- What research gaps remain before any alternative can be recommended?
- What is the procurement and testing lead time?

Source the alternatives research to peer-reviewed studies, industry testing programs, and verified case studies. Label preliminary findings as such. Do not recommend alternatives that have not been tested against the specific performance requirements of the industry.

---

### Output Structure for Every Regulatory Deep Dive

Every deep dive must produce the following sections in this order:

1. **Regulation identification** — full name, citation, primary source URL, effective date, jurisdiction
2. **Source authority hierarchy** — what sources were used and at what confidence level
3. **Immediate action items** — what requires a decision now, not at the compliance deadline
4. **Compliance chain mapping** — where each entity in scope sits and what obligations attach
5. **Classification analysis** — threshold questions that must be resolved before compliance programs are designed
6. **Format or operation analysis** — separate analysis for each distinct asset type or operational mode in scope
7. **Third party exposure** — where compliance failures by others land on the entities in scope
8. **Confirmed timeline** — milestones with source attribution and confidence level
9. **Industry-specific translation** — what the regulation means operationally for this specific sector
10. **Alternatives and innovation** — where substitution or investment is required, current state of alternatives
11. **Legal confirmation required items** — consolidated list of all unresolved questions requiring legal advice before action
12. **Sources** — all sources used, classified by authority level

---

### Quality Standard

The PPWR v7 Regulatory Fact Document produced for Dietl International and Rockit in April 2026 is the benchmark. Every regulatory deep dive produced using this skill should meet that standard for:

- Source attribution at every claim
- Separation of confirmed fact from inference from legal question
- Operational specificity to the industry being analyzed
- Identification of immediate action items before the compliance horizon
- Honest flagging of what is unresolved rather than defaulting to the most conservative interpretation
- Commercial consequence analysis — not just what the law requires but what happens operationally when requirements are not met
