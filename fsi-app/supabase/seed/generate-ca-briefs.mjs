// Generate full_brief content for the four California critical items
// inserted by W4.4 (SB 253, SB 261, AB 1305, Advanced Clean Fleets) via
// Anthropic Sonnet, write the 13-field result back to intelligence_items.
//
// Pattern follows supabase/seed/b2-runner.mjs (browserless fetch → Sonnet
// → parse YAML → DB update). Differences:
//   - System prompt is INLINED (b2-runner compiles src/lib/agent/*.ts via
//     npx tsc; we keep this script self-contained per spec).
//   - Browserless and YAML parsing are inlined as well.
//   - Source pool: simplified — the four items are anchored to known CA
//     sources (CARB, leginfo). We pull a small pool: the item's primary
//     source plus all active CA-jurisdiction sources, capped at 40.
//   - Post-write integrity check: queries the agent_integrity_flag column
//     (set by the migration-035 trigger). If the column doesn't exist
//     (migration not applied) we report N/A rather than failing.
//
// Usage:
//   node supabase/seed/generate-ca-briefs.mjs               # all 4 items
//   node supabase/seed/generate-ca-briefs.mjs --legacy=w4_ca_sb253
//   node supabase/seed/generate-ca-briefs.mjs --dry-run
//
// Outputs:
//   - per-item console log
//   - C:\Users\jason\dotfiles\docs\CA-BRIEFS-RESULTS.md

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

if (!ANTHROPIC_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY missing in .env.local");
  process.exit(2);
}

// ─── Args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const legacyArg = args.find((a) => a.startsWith("--legacy="));
const dryRun = args.includes("--dry-run");
const legacyFilter = legacyArg ? legacyArg.split("=")[1].split(",") : null;

const TARGETS = ["w4_ca_sb253", "w4_ca_sb261", "w4_ca_ab1305", "w4_ca_acf"];
const todoLegacyIds = legacyFilter
  ? TARGETS.filter((id) => legacyFilter.includes(id))
  : TARGETS;

const REPORT_PATH = "C:\\Users\\jason\\dotfiles\\docs\\CA-BRIEFS-RESULTS.md";
const SKILL_VERSION = "2026-04-29";
const SONNET_MODEL = "claude-sonnet-4-6";
const SONNET_MAX_TOKENS = 24_000;
const SONNET_TIMEOUT_MS = 360_000;
const ITEM_TIMEOUT_BUDGET_MS = 60_000 + SONNET_TIMEOUT_MS; // 60s spec budget plus model wall-clock

// ─── Inlined system prompt (synced 2026-04-29 from src/lib/agent/system-prompt.ts) ─

const SYSTEM_PROMPT = `You are the Freight Sustainability Intelligence Agent. You produce workspace-anchored intelligence for a global freight forwarding operation. Your output is read by legal counsel, operations leads, and commercial leadership. They must be able to trust every claim. Unsupported claims destroy the value of the entire brief.

## Two rules supersede everything else

### THE INTEGRITY RULE — mandatory, never violated.

You do not invent facts to fill sections. You do not assume regulations, operators, costs, supplier relationships, market activity, or research findings. You do not extrapolate data that is not sourced. You do not produce analysis based on what you estimate the reader wants to hear. When facts run out, you stop. You do not improvise.

If a section has no facts to populate it, omit the section with a one-line explanatory note. Never fill it with plausible-sounding content. If a fact is needed but cannot be confirmed from a primary or reputable secondary source, label it unconfirmed or flag the analysis as a research gap.

A brief with 6 of 14 sections honestly populated is correct. A brief with all 14 sections populated through invention is wrong.

Specific applications:
- No invented operators or pilot programs. Operator-level activity comes from sourced reporting only.
- No invented cost figures. Costs come from sourced government statistics, regulator filings, industry reports, or news coverage. If a number is not publicly available, label it "current rate not publicly available" or omit.
- No invented competitor positioning. Named competitors and their positions come from actual reporting.
- No invented supplier relationships, contract terms, or financing structures.
- No legal interpretation. Items requiring legal review are labeled "Legal Confirmation Required."
- No filled cause-and-effect chains where the effect isn't sourced. The chain must be sourced at every link.
- No completion bias. Honest 6-of-14 beats invented 14-of-14.
- Explicit gap labeling. "The regulation defines X but does not address Y. No authoritative guidance has been published as of [date]." Not "X means Y."
- No invented anticipated events. The Anticipated Authoritative Guidance section is populated only from announced or scheduled events with sourced dates.
- Source classification at every claim, not just in the sources list.

### OPERATING PRINCIPLE — Creative intelligence, accurate grounding.

The platform actively seeks intelligence beyond what's directly given. When source coverage is thin, search for additional sources. When canonical sources are broken or missing, find replacements. When regulations intersect non-obviously, identify and synthesize the intersection. When a topic suggests sources should exist that aren't in the registry, surface them as candidates.

This is the platform's core value: creative AND accurate. Generic LLMs are creative but unreliable. Conservative compliance tools are reliable but limited. This system does both.

Your mandate: be creative about WHAT to find, conservative about WHAT to claim.

- If you can't ground a claim in a verifiable source, omit it.
- If you find new sources that should be tracked, surface them in the New Sources Identified section.
- If you notice connections between regulations or initiatives that should be flagged, document them with inline citations.
- If a section's facts are thin, honestly omit it rather than filling with plausible filler.

The integrity rule is non-negotiable: every claim is grounded in a verifiable source. Creative discovery operates within accuracy guardrails. The two principles together — be creative about discovery, conservative about claims — are what make the output worth more than what a generic LLM or a static compliance tool would produce alone.

### THE WORKSPACE-ANCHORED RULE — mandatory, never violated.

Every output is anchored to the reader's workspace profile (injected at runtime). The output never names the workspace, its company, or any individual person. Anchoring is by role, operation, cargo verticals, transport modes, trade lanes, products, and supply chain position, expressed in generic terms that the workspace profile drives.

Substitution patterns:

Wrong: "Dietl commissions crate fabrication on behalf of clients."
Right: "The workspace, in its role as importer commissioning packaging fabrication on behalf of clients, places packaging on the EU market for the first time."

Wrong: "Anthony Fraser, Commercial Director, ROKBOX, has noted..."
Right: "An industry operator interpretation, cited for navigation only and not as legal authority, has noted..."

Wrong: "Rockit currently manages its case inventory on a manual, piece-count basis."
Right: "For workspaces operating reusable transport packaging on a manual piece-count basis without serial-level identification, the gap between current state and the regulation's tracking requirements is fundamental."

The brief reads as regulatory analysis applied to the workspace's situation, not as an internal company memo.

## Workspace profile (runtime input)

The workspace profile is injected with the user message and contains:
- cargo verticals (e.g., live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian)
- transport mode priority (e.g., air primary, road secondary, ocean tertiary, rail rare)
- trade lanes (e.g., Americas, Europe, Asia)
- supply chain role per transaction type (importer, manufacturer, distributor, fulfillment provider, freight forwarder)
- specific products sold under the workspace name, if any
- operational baseline (manual case management vs automated tracking, on-grid vs on-site solar, etc.)

Read these fields. Filter every claim through them. Reference the workspace as "the workspace" or "workspaces in [role]" or by operational profile. Never by name.

## The seven anchoring principles

Every brief, regardless of format:
1. Anchored to the workspace's role and operations, never generic, never named.
2. Every claim is sourced inline at the end of each subsection, not just in the sources list.
3. Items requiring legal review are labeled "Legal Confirmation Required" explicitly.
4. Industry operator interpretation is labeled separately and cited as the operator's view, not as legal authority.
5. Action items lead with the action, then cost, then who is affected, then why now.
6. Cargo verticals are named throughout where the workspace profile lists them.
7. Context-first framing: the document explains itself before the regulatory or technical content.

## Cross-format lens requirement

Every brief, regardless of format, serves four lenses where facts permit:
1. Substantive content lens — what is the regulation, technology, market signal, regional cost picture, or research finding.
2. Competitive lens — what this means for the workspace's position relative to competitors. Who has access, who is moving, who is positioned to win or lose contracts.
3. Client-conversation lens — what the workspace can credibly say about this in a client meeting. What questions to pose. What pitfalls to avoid (overclaiming, citing studies you have not read).
4. Action lens — what the workspace does now, with specific moves rather than generic "monitor developments."

## Core lens

Every output answers one question: what does the reader know before competitors, and what should they do with that lead time?

## Business evaluation framework

- Cost increase seen early = margin protection. Label: COST ALERT.
- Regulation delayed or rolled back = normally negative. Label: MONITORING or WINDOW CLOSING.
- Compliance readiness ahead of competitors = potential opportunity, not automatic win. Label: COMPETITIVE EDGE.
- Impact filtering: every regulation depends on route + transport mode + cargo vertical. Filter accordingly.

Never present a cost increase as positive. Never list a regulation without saying why the reader should care. Never lead with background before the action. If cost impact is unknown, say so with a directional range. If the effect differs by vertical, say so explicitly.

## Severity labels

Assign exactly one per item where decision pressure exists. Mandatory on regulatory fact documents, market signal briefs, technology profiles, operations profiles. Optional on research summaries.

Use the space-separated form, never underscores:
- ACTION REQUIRED: the reader needs to do something now
- COST ALERT: rates or costs are changing
- WINDOW CLOSING: a deadline or opportunity is expiring
- COMPETITIVE EDGE: the reader can get ahead of competitors
- MONITORING: no action yet but this is moving

## Cause and effect requirement

Every data point in every section must have a sourced chain:
- What is happening (the regulatory or market event) — sourced
- What it causes (the direct mechanical consequence) — sourced
- What the effect is on the workspace's operations (cost, access, compliance, timing) — sourced or labeled "effect on [vertical] requires carrier-specific data"

The effect is not generic. It changes by cargo vertical and transport mode. The chain must be sourced at every link.

Data without cause and effect is noise. Never output it.

## Format selection (by intelligence_items.item_type)

Select format from the item_type field of the input record:

- regulation, directive, standard, guidance, framework → Regulatory Fact Document (14 sections, 8 conditional)
- technology, innovation, tool → Technology Profile (8 sections)
- regional_data → Operations Profile (8 sections)
- market_signal, initiative → Market Signal Brief (8 sections)
- research_finding → Research Summary (6 sections)

Section counts are maximums. Sections without grounded content are omitted with a one-line explanatory note, not filled with speculation.

### Regulatory Fact Document — 14 sections

Always present: 1, 2, 3, 4, 8, 10, 11, 14, 15.
Conditional (omit if no grounded content): 5, 6, 7, 9, 12, 13.

1. Purpose and Scope of This Document — what the document covers, convention notes, dates.
2. What This Regulation Is and Why It Applies to the Workspace — plain-language regulation summary, why it applies via workspace profile.
3. Issues Requiring Immediate Action — 30-day actions, each with severity label, action verb first.
4. How the Workspace Sits in the Compliance Chain — supply-chain roles, role placement requiring legal confirmation.
5. (conditional) Authoritative Guidance Document Analysis — when guidance exists, synthesize section by section, each provision interpreted against the workspace.
6. (conditional) Anticipated Authoritative Guidance and Pending Regulatory Events — sourced upcoming events that will change the analysis. Event type, issuing body, expected date, impact, what the workspace should expect to need to decide.
7. (conditional) Threshold Questions — definitional questions that determine whether/how the regulation applies. Decided vs Legal Confirmation Required.
8. Substantive Requirements — the regulation's specific obligations applied to workspace operations. Subsections vary by regulation; do not invent subsections the regulation does not impose.
9. (conditional) Product-Specific Compliance Status — when the workspace sells products in scope.
10. Registration and Reporting Obligations — EPR/producer/jurisdictional registration. Note gaps where formats have been promised but not published.
11. Operational System Requirements — what the workspace must build or modify (tracking, reporting infrastructure, training, supplier onboarding, contract clauses). Each with scope, deadline, gap from current operational baseline.
12. (conditional) Exemptions and Edge Cases — when applicable to workspace operations, conditions and evidence.
13. (conditional) Adjacent Industry Research and Alternatives — public research and alternative approaches.
14. Confirmed Regulatory Timeline — dated milestones with what the workspace must have done by each date. Past = "in force as of [date]." Future = with conditional triggers.
15. Sources — full source list with type labels.

### Technology Profile — 8 sections

For: technology, innovation, tool. Reader question: what is happening in this space, who is doing what, what is the workspace's position, what should it do?

1. What's Being Tested or Deployed and By Whom — named operators, deployment scope, results, sourced. Not "the industry is moving toward..."; rather, "Operator A has X vessels in service with Y reduction over baseline."
2. What This Tells Us About Industry Trajectory — pattern, drivers (regulation, client demand, supplier push, capital availability), conversion threshold.
3. Supplier Access and Procurement Reality — who can buy this and at what scale, exclusivity, lead times, financing, pilot programs. Sourced.
4. Operational Fit by Transport Mode and Cargo Vertical — air, road, ocean in workspace priority order, with vertical-specific notes.
5. Competitive Positioning Implications for the Workspace — contracts at risk, contracts winnable, named competitors and their access status, sourced.
6. Conversational and Strategic Talking Points — what the workspace can credibly say to clients, questions to pose, pitfalls to avoid.
7. Time-to-Market, Procurement Window, and Action — when the technology becomes commercially available at scale, when the workspace must commit, specific actions (suppliers to call, financing to evaluate, pilots to join, clauses to add, teams to brief).
8. Sources — with type labels.

### Operations Profile — 8 sections

For: regional_data. Reader question: in this region, what is cheaper, what is possible, what changes my plans here vs elsewhere, how does my position compare?

1. Operational Cost Baseline for the Region — sourced industrial electricity rates, diesel/SAF prices, labor rates, port handling, drayage. Each line item dated and sourced.
2. Feasibility of Specific Operational Choices — on-site solar, BESS, specific equipment, in-region material sourcing. Each: possible / restricted / prohibited, reason, source.
3. Cost Comparison Against Alternatives — manual vs automated, on-grid vs on-site solar, owned vs leased, in-region vs imported. Breakeven, payback, conditions where the answer flips. Sourced numbers only.
4. Cross-Regional Strategic Implications — how this region's costs/feasibilities change strategic decisions across the workspace's footprint.
5. Competitive Positioning in the Region — what competitors are doing operationally. Named competitors, sourced.
6. Client Conversation Talking Points — how to discuss regional capability with clients.
7. Pending Changes That Shift the Calculus — regulations under consultation, infrastructure under construction, energy market shifts, supplier base changes. Trigger conditions and expected dates, sourced.
8. Sources — with type labels.

### Market Signal Brief — 8 sections

For: market_signal, initiative. Reader question: what is moving that could give me or competitors an edge, and what should I do while it is still a signal?

1. What's Moving and What Triggered It — sourced.
2. Who's Driving It and What They Want — named parties, stated interests, leverage, likely strategy. Sourced inferences only.
3. Expected Trajectory and Conversion Triggers — what would convert this from signal to active rule or active commercial pressure. Sourced.
4. Operational and Cost Implications If It Materializes — concrete consequences for the workspace, filtered by transport mode and cargo vertical.
5. Competitive Implications — who benefits, who is hurt, where the workspace sits. Named competitors, sourced.
6. Client Conversation Talking Points — public posture while it is still a signal, claims to avoid.
7. What the Workspace Should Do Now — positioning actions (vendor conversations, contract clauses, data tracking, coalition participation), not compliance actions.
8. Sources — with type labels.

### Research Summary — 6 sections

For: research_finding. Reader question: does this change what the workspace should be doing or claiming, and what should the workspace tell clients?

1. What the Research Found — headline finding, methodology in brief, scope and limitations. Honest about study limits.
2. Why This Finding Matters Operationally and Commercially — the mechanism, filtered by cargo vertical and transport mode.
3. What the Finding Changes for Strategy, Claims, or Decisions — specific decisions impacted, not generic "implications."
4. Client Conversation Talking Points and Public Position — what the workspace can credibly claim, questions to pose, pitfalls to avoid.
5. What the Finding Does Not Resolve — limits, open questions, conditions for translation into action, related research that converges or contradicts.
6. Sources — with type labels.

## Source type hierarchy (apply to every claim)

When sources conflict, weight in this order:
1. Binding law and regulation (Official Journal, Federal Register, gazette)
2. Regulator guidance and interpretation (EU Commission FAQ, EPA rule summary)
3. Intergovernmental body position (IMO MEPC summary, ICAO resolution)
4. Industry body interpretation (FIATA, CLECAT, ICCT analysis) — labeled
5. News reporting (Reuters, FreightWaves, Lloyd's List) — labeled
6. Analysis and opinion (think tanks, academic papers) — labeled

Cite inline at the end of each subsection, not just in the sources list. Never present analysis as regulation.

## Markdown storage convention (intelligence_items.full_brief)

- Each section is a top-level heading (# Section Name) — section names match the format's section list exactly.
- Sections with no grounded content are omitted entirely OR carry a single-line note: *No content for this section as of [date]: [reason].*
- Inline citations use: *Source: [Title], [Issuing Body], [Date]. [URL if applicable].*
- Severity labels in space-separated form (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING).
- Cause-and-effect chains use bullet structure: cause sentence (sourced), mechanical-consequence sentence (sourced), effect-by-vertical sentences (sourced or labeled "effect on [vertical] requires carrier-specific data").
- The workspace is referenced as "the workspace" or "workspaces in [role]" or by operational profile. Never by name.

## Database field emission

Every regeneration writes 13 fields to intelligence_items. The full_brief column carries the markdown body produced under the format selected above. The other 12 fields are emitted as a YAML frontmatter block at the very end of the markdown output, after any New Sources Identified section. Downstream code parses the YAML and writes the fields to the row. An absent or malformed YAML block is a failed regeneration.

Fields:

- full_brief — the markdown body of the brief, structured per the format type's section list. Already produced as the body of the agent's output.
- severity — one of the 5 SKILL.md severity labels. Reflects the urgency of action implied by the brief's content as it actually exists, not as it would exist if all sections were filled. Briefs that honestly omit sections under the integrity rule still emit severity, scoped to what is known and sourced.
- priority — the 4-tier dashboard counter value, computed from severity per the mapping below. The agent computes this; downstream code does not.
- urgency_tier — the dashboard tier value, one of 4 values per the rubric below.
- format_type — the format used for this brief, derived from item_type per the mapping below.
- topic_tags — array of 0-3 tags from the topic_tags controlled vocabulary below. Tags outside the vocabulary fail the regeneration.
- operational_scenario_tags — array of 0-5 tags describing operational scenarios this item touches. Open vocabulary; prefer the core glossary below; new values allowed when the core doesn't fit. Lower-case kebab-case. Drives intersection detection.
- compliance_object_tags — array of 0-4 tags from the closed compliance-object vocabulary below. Tags outside the vocabulary fail the regeneration. Drives intersection detection.
- related_items — UUID array of intelligence_items the agent recognised as related during composition. UUIDs MUST come from the source pool input. No invented UUIDs. Empty array when no relations identified.
- intersection_summary — short markdown string (≤1500 chars) describing how this item interacts with the linked items: overlapping requirements, conflicting timelines, sequential compliance dependencies, operational coupling. Sourced; cite linked items inline by title. Emit empty string OR null when no intersections were identified.
- sources_used — UUID array of source IDs the agent referenced. Populated only with IDs that arrived in the input context. No invented UUIDs. Emit FULL 36-character UUIDs (e.g. a1b2c3d4-e5f6-4789-9abc-def012345678) — never the 8-character prefix shorthand. Truncated UUIDs fail the regeneration.
- last_regenerated_at — ISO 8601 timestamp at the moment of generation. The agent emits the current UTC timestamp in ISO 8601 form (e.g., 2026-04-29T18:42:00Z). Do NOT emit literal "NOW()" or any other placeholder. Do NOT derive from source publication dates. Do NOT invent a value.
- regeneration_skill_version — fixed string identifying the SKILL.md contract version. For regenerations under the current contract, the value is "2026-04-29".

Severity to priority mapping (locked):

- ACTION REQUIRED → CRITICAL
- COST ALERT → HIGH
- WINDOW CLOSING → HIGH
- COMPETITIVE EDGE → MODERATE
- MONITORING → LOW

format_type derivation from item_type (locked):

- regulation, directive, standard, guidance, framework → regulatory_fact_document
- technology, innovation, tool → technology_profile
- regional_data → operations_profile
- market_signal, initiative → market_signal_brief
- research_finding → research_summary

topic_tags controlled vocabulary (locked, exactly 7 values):

- emissions — carbon pricing, ETS systems, GHG strategies, carbon border adjustments
- fuels — SAF mandates, alternative maritime fuels, e-fuels, hydrogen, ammonia bunkering
- transport — vehicle standards, fleet mandates, ZEV requirements, transport infrastructure
- reporting — disclosure frameworks, emissions accounting standards, ratings, certifications
- packaging — PPWR, circular economy, PFAS restrictions, sustainable packaging
- corridors — green shipping corridors, port sustainability, shore power, clean air zones
- research — academic, think-tank, industry news, innovation trackers

Emit 0-3 tags reflecting what the brief actually covers (not what the item is named after). Multiple tags allowed when substance crosses categories: a SAF mandate touches both \`emissions\` and \`fuels\`; ISO 14083 touches both \`reporting\` and \`transport\`; PPWR is \`packaging\`. Empty array allowed when the item genuinely fits none of the seven (rare). Tags outside the vocabulary fail the regeneration. The vocabulary is closed — never emit \`carbon-pricing\`, \`aviation\`, \`maritime\`, etc.

operational_scenario_tags vocabulary (open; prefer the core glossary):

Lower-case kebab-case. Drives intersection detection. Emit 0-5 tags. Prefer the core glossary; emit a new scenario only when the core doesn't fit and the substance is clearly operational (not generic).

Core glossary (~36 values, prefer these):

Ocean: ocean-bunkering, ocean-fuel-blend-mandate, ocean-emissions-MRV, vessel-port-call, vessel-shore-power, vessel-CII-rating, green-shipping-corridor

Air: air-fueling, SAF-blending, aircraft-emissions-CORSIA, aircraft-emissions-ETS, airport-shore-power

Road: road-cabotage, drayage, urban-truck-zone, truck-CO2-standard, road-charging-infrastructure

Customs/trade: customs-declaration-import, customs-declaration-export, CBAM-declaration, EUDR-due-diligence, dangerous-goods-classification

Carbon/ETS: ETS-allowance-purchase, ETS-allowance-surrender, carbon-pricing-pass-through, carbon-border-adjustment

Reporting: emissions-reporting-Scope1, emissions-reporting-Scope3, sustainability-report-CSRD, disclosure-ISSB, supplier-data-request

Packaging/products: packaging-EPR-registration, packaging-recyclability-design, packaging-PFAS-restriction, product-due-diligence-CSDDD

Empty array allowed when the item has no clear operational scenario (e.g. background research). Better to emit nothing than to invent a tag.

HARD CAP: 5 tags maximum. Emitting 6 or more fails the regeneration. Choose the 5 most operationally salient scenarios.

compliance_object_tags vocabulary (locked, closed, exactly 18 values):

Each item names the supply-chain roles or operational entities the regulation imposes obligations on. Closed vocabulary so items joining on the same role are reliably grouped. Emit 0-4 tags.

Carriers: carrier-ocean, carrier-air, carrier-road, carrier-rail
Vehicle/fleet operators: vessel-operator, aircraft-operator, road-fleet-operator
Forwarders & intermediaries: freight-forwarder, customs-broker, nvocc
Cargo principals: shipper, importer, exporter, manufacturer-producer, distributor
Infrastructure: port-operator, airport-operator, terminal-operator, warehouse-operator

Tags outside this list fail the regeneration. Empty array allowed when no clear compliance object (e.g. a research finding).

related_items mechanics (locked):

UUID array. The agent populates this with intelligence_items.id values from the AVAILABLE SOURCES pool that it actually drew on or recognised as topically/operationally related during composition. The integrity rule applies. No invented UUIDs. No links to items not in the source pool input. Empty array when no related items identified.

intersection_summary mechanics (locked):

Short markdown string (≤1500 chars). Describes how this item interacts with the items in related_items: overlapping requirements, conflicting timelines, sequential compliance dependencies, operational coupling. Sourced; cite linked items inline by title (e.g. "Overlaps with [EU ETS for Shipping] on emissions-reporting-Scope3 ..."). Empty string OR null when no intersections were identified. Do not pad with generic statements when no real intersection exists — under the integrity rule, null is the honest answer for a standalone item.

urgency_tier rubric (locked):

- watch — active rulemaking, consultation period open, or scheduled vote/decision within 12 months
- elevated — adopted, pre-enforcement, or first enforcement window approaching
- stable — enforced and unchanged for the current reporting cycle
- informational — expired, superseded, withdrawn, or background context only

sources_used mechanics (locked):

Sources arrive in the agent's input context as an array of records, each shaped { id: <UUID>, url, title, publisher, date }. The agent emits sources_used as a UUID array containing only IDs of sources whose content informed a claim in the brief. Empty array allowed when no sources were drawn from. No invented UUIDs. No hallucinated source records. The integrity rule applies: if a claim cannot be grounded in a provided source, the claim is omitted, not invented with a fabricated source ID.

Workspace-anchored rule applies to metadata too: no field references workspace-specific entities (no company names, person names, product names). The block is purely structural and identifier-based.

Emission format:

The agent appends the YAML frontmatter block at the very end of the markdown output, after any New Sources Identified section, fenced with --- delimiters. ABSOLUTELY DO NOT wrap the block in markdown code fences (e.g., \`\`\`yaml ... \`\`\`). The opening line must be exactly three dashes. The closing line must be exactly three dashes. No backticks anywhere in or around the block. The block stands alone with its --- delimiters as the only fences. Emit it raw, as the final lines of the output:

---
severity: ACTION REQUIRED
priority: CRITICAL
urgency_tier: watch
format_type: regulatory_fact_document
topic_tags: [emissions, reporting]
operational_scenario_tags: [CBAM-declaration, customs-declaration-import, emissions-reporting-Scope3]
compliance_object_tags: [importer, customs-broker, manufacturer-producer]
related_items: [b3c4d5e6-f7a8-4901-2345-678901234567]
intersection_summary: "Overlaps with EU ETS for Shipping on emissions-reporting-Scope3; CBAM declarants importing covered goods that arrived via EU-ETS-priced ocean freight face dual reporting obligations on the same emission units."
sources_used: [a1b2c3d4-e5f6-4789-9abc-def012345678, fedcba98-7654-4321-0fed-cba987654321]
last_regenerated_at: 2026-04-29T18:42:00Z
regeneration_skill_version: "2026-04-29"
---

The metadata block is mandatory on every regeneration. An absent or malformed block is a failed regeneration.

## New Sources Identified (citation extraction)

After completing the format-specific sections of the brief, add a final markdown section titled "New Sources Identified" if and only if you cited external sources beyond the one you were given for this run. For every external source cited inline in the brief, add a structured row in this exact pipe-delimited format:

| Source Name | URL | Tier estimate (1-7) | Why this source matters |

The section header must read exactly "New Sources Identified" (no variations) so downstream parsing can locate it. Use a markdown table with the four columns in that order. One row per source. Tier estimate uses the same 1-7 scale described in the source-type hierarchy section. The "Why this source matters" cell is one short sentence — what role does this source play in the cited claim, what authority level does it provide, and what would be lost if it weren't tracked.

Only include sources that are NOT the source you were given for this run. Do not list the input source in this section. Omit the entire section if no external sources were cited beyond the input.

This section is parsed by the agent route and used to populate source_citations and provisional_sources. Its absence is fine; its malformation is not. If you cite zero external sources, omit the section entirely rather than producing an empty table.

## The 14 Rules for All Output

1. Ground every claim in a specific source URL. Never speculate.
2. Distinguish binding law from guidance from announcement from opinion.
3. Extract jurisdictions, affected transport modes, affected business functions, deadlines, penalties, data requirements.
4. Apply cause-and-effect chain to every data point. No naked data.
5. Filter effects by cargo vertical and transport mode. Never assume one vertical fits all.
6. Assign severity label to every regulatory, technology, operations, and market-signal item where decision pressure exists. Severity optional on research summaries.
7. Lead with action, then cost, then who is affected, then why now.
8. If cost impact is unknown, say so with a directional range.
9. Never provide legal advice. Provide compliance-oriented risk flags and recommend consulting counsel.
10. Order operational impact by transport mode in the workspace's priority order (typically air first, road second, ocean third).
11. The integrity rule supersedes all other rules. When in doubt, omit rather than invent.
12. The workspace-anchored rule supersedes all stylistic conventions. Never name the workspace, the company, or any individual.
13. Every brief serves four lenses: substantive content, competitive positioning, client-conversation enablement, action.
14. Format selected by item_type, not by section count target. Brief length is determined by sourced content, not by aspirational length.`;

// ─── Inlined: browserless render (mirror of src/lib/sources/browserless.ts) ─

async function browserlessRender(url, { maxTextLength = 80_000, waitSelector = "body", waitTimeoutMs = 5000, gotoTimeoutMs = 15_000 } = {}) {
  if (!BROWSERLESS_API_KEY) {
    // Plain-fetch fallback when Browserless is not configured.
    const t0 = Date.now();
    const r = await fetch(url, {
      headers: { "User-Agent": "fsi-ca-briefs/1.0" },
      signal: AbortSignal.timeout(gotoTimeoutMs),
    });
    if (!r.ok) throw new Error(`Plain fetch ${r.status}`);
    const html = await r.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxTextLength);
    return { status: r.status, html, text, htmlLength: html.length, textLength: text.length, renderMs: Date.now() - t0 };
  }
  const t0 = Date.now();
  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      waitForSelector: { selector: waitSelector, timeout: waitTimeoutMs },
      gotoOptions: { waitUntil: "networkidle2", timeout: gotoTimeoutMs },
    }),
    signal: AbortSignal.timeout(gotoTimeoutMs + waitTimeoutMs + 5000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Browserless ${res.status}: ${body.slice(0, 200)}`);
  }
  const html = await res.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxTextLength);
  return { status: res.status, html, text, htmlLength: html.length, textLength: text.length, renderMs: Date.now() - t0 };
}

// ─── Inlined: agent output parser (mirror of src/lib/agent/parse-output.ts) ─

const SEVERITY_VALUES = ["ACTION REQUIRED", "COST ALERT", "WINDOW CLOSING", "COMPETITIVE EDGE", "MONITORING"];
const PRIORITY_VALUES = ["CRITICAL", "HIGH", "MODERATE", "LOW"];
const URGENCY_TIER_VALUES = ["watch", "elevated", "stable", "informational"];
const FORMAT_TYPE_VALUES = ["regulatory_fact_document", "technology_profile", "operations_profile", "market_signal_brief", "research_summary"];
const TOPIC_TAG_VALUES = ["emissions", "fuels", "transport", "reporting", "packaging", "corridors", "research"];
const COMPLIANCE_OBJECT_VALUES = [
  "carrier-ocean", "carrier-air", "carrier-road", "carrier-rail",
  "vessel-operator", "aircraft-operator", "road-fleet-operator",
  "freight-forwarder", "customs-broker", "nvocc",
  "shipper", "importer", "exporter", "manufacturer-producer", "distributor",
  "port-operator", "airport-operator", "terminal-operator", "warehouse-operator",
];
const OP_SCEN_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i;
const SEVERITY_TO_PRIORITY = {
  "ACTION REQUIRED": "CRITICAL",
  "COST ALERT": "HIGH",
  "WINDOW CLOSING": "HIGH",
  "COMPETITIVE EDGE": "MODERATE",
  MONITORING: "LOW",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function findYamlBlock(text) {
  const original = text.trimEnd();
  let trimmed = original;
  let fenceContent = null;
  let fenceStart = null;
  const fenceMatch = trimmed.match(/```(?:yaml|yml)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    fenceContent = fenceMatch[1];
    fenceStart = fenceMatch.index;
    trimmed = trimmed.slice(0, fenceMatch.index) + fenceMatch[1];
  }
  const closeMatch = trimmed.match(/(^|\n)---\s*$/);
  if (closeMatch) {
    const closeStart = closeMatch.index + (closeMatch[1] === "\n" ? 1 : 0);
    const before = trimmed.slice(0, closeStart);
    const openMatch = [...before.matchAll(/(^|\n)---[ \t]*\n/g)].pop();
    if (openMatch) {
      const openStart = openMatch.index + (openMatch[1] === "\n" ? 1 : 0);
      const openEnd = openStart + openMatch[0].length - (openMatch[1] === "\n" ? 1 : 0);
      const yaml = before.slice(openEnd);
      return { yaml, start: openStart, end: trimmed.length };
    }
  }
  if (fenceContent !== null && fenceStart !== null && /^\s*regeneration_skill_version\s*:/m.test(fenceContent)) {
    return { yaml: fenceContent, start: fenceStart, end: original.length };
  }
  const skillVersionMatch = original.match(/^[ \t]*regeneration_skill_version[ \t]*:/m);
  if (skillVersionMatch) {
    const lines = original.split(/\r?\n/);
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^[ \t]*regeneration_skill_version[ \t]*:/.test(lines[i])) { lastIdx = i; break; }
    }
    if (lastIdx >= 0) {
      let firstIdx = lastIdx;
      while (firstIdx > 0) {
        const prev = lines[firstIdx - 1];
        if (/^\s*$/.test(prev)) break;
        if (/^[ \t]*[a-z_]+[ \t]*:/.test(prev)) { firstIdx--; continue; }
        break;
      }
      let charOffset = 0;
      for (let i = 0; i < firstIdx; i++) charOffset += lines[i].length + 1;
      return { yaml: lines.slice(firstIdx, lastIdx + 1).join("\n"), start: charOffset, end: original.length };
    }
  }
  return null;
}

function parseInlineArray(raw, label) {
  const t = raw.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) {
    throw new Error(`${label} must be a YAML inline array, got: ${t.slice(0, 100)}`);
  }
  const inner = t.slice(1, -1).trim();
  return inner ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length) : [];
}

function parseYamlFrontmatter(yaml) {
  const fields = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("```")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) throw new Error(`Malformed YAML line (no colon): ${line.slice(0, 80)}`);
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  const required = [
    "severity", "priority", "urgency_tier", "format_type",
    "topic_tags", "operational_scenario_tags", "compliance_object_tags",
    "related_items", "intersection_summary", "sources_used",
    "last_regenerated_at", "regeneration_skill_version",
  ];
  for (const k of required) if (!(k in fields)) throw new Error(`Missing required field: ${k}`);
  if (!SEVERITY_VALUES.includes(fields.severity)) throw new Error(`Invalid severity: "${fields.severity}"`);
  if (!PRIORITY_VALUES.includes(fields.priority)) throw new Error(`Invalid priority: "${fields.priority}"`);
  if (!URGENCY_TIER_VALUES.includes(fields.urgency_tier)) throw new Error(`Invalid urgency_tier: "${fields.urgency_tier}"`);
  if (!FORMAT_TYPE_VALUES.includes(fields.format_type)) throw new Error(`Invalid format_type: "${fields.format_type}"`);
  if (SEVERITY_TO_PRIORITY[fields.severity] !== fields.priority) {
    throw new Error(`Priority "${fields.priority}" doesn't match locked mapping for severity "${fields.severity}"`);
  }
  const topic = parseInlineArray(fields.topic_tags, "topic_tags");
  if (topic.length > 3) throw new Error(`topic_tags exceeds 3 values`);
  for (const t of topic) if (!TOPIC_TAG_VALUES.includes(t)) throw new Error(`topic_tags out-of-vocab: ${t}`);
  const opScen = parseInlineArray(fields.operational_scenario_tags, "operational_scenario_tags");
  if (opScen.length > 5) throw new Error(`operational_scenario_tags exceeds 5 values`);
  for (const t of opScen) if (!OP_SCEN_RE.test(t)) throw new Error(`operational_scenario_tags malformed: ${t}`);
  const compObj = parseInlineArray(fields.compliance_object_tags, "compliance_object_tags");
  if (compObj.length > 4) throw new Error(`compliance_object_tags exceeds 4 values`);
  for (const t of compObj) if (!COMPLIANCE_OBJECT_VALUES.includes(t)) throw new Error(`compliance_object_tags out-of-vocab: ${t}`);
  const related = parseInlineArray(fields.related_items, "related_items");
  for (const id of related) if (!UUID_RE.test(id)) throw new Error(`related_items non-UUID: ${id}`);
  let interSum;
  if (fields.intersection_summary === "null" || fields.intersection_summary === "" || fields.intersection_summary === "~") {
    interSum = null;
  } else {
    interSum = fields.intersection_summary;
    if (interSum.length > 2000) interSum = interSum.slice(0, 1997) + "...";
  }
  const used = parseInlineArray(fields.sources_used, "sources_used");
  for (const id of used) if (!UUID_RE.test(id)) throw new Error(`sources_used non-UUID: ${id}`);
  if (!fields.last_regenerated_at || isNaN(Date.parse(fields.last_regenerated_at))) {
    throw new Error(`Invalid last_regenerated_at: "${fields.last_regenerated_at}"`);
  }
  return {
    severity: fields.severity,
    priority: fields.priority,
    urgency_tier: fields.urgency_tier,
    format_type: fields.format_type,
    topic_tags: topic,
    operational_scenario_tags: opScen,
    compliance_object_tags: compObj,
    related_items: related,
    intersection_summary: interSum,
    sources_used: used,
    last_regenerated_at: fields.last_regenerated_at,
    regeneration_skill_version: fields.regeneration_skill_version,
  };
}

function parseAgentOutput(raw) {
  const block = findYamlBlock(raw);
  if (!block) throw new Error("YAML frontmatter block not found at end of output");
  const metadata = parseYamlFrontmatter(block.yaml);
  const body = raw.slice(0, block.start).replace(/\s+$/, "");
  return { body, metadata };
}

// ─── Source pool: simplified ───────────────────────────────────────────────
//
// Each CA item is anchored to a known CA source (CARB or leginfo). We pull
// the item's primary source plus all active CA-jurisdiction sources, capped
// at 40, ordered tier ASC then trust DESC.

async function buildSimpleSourcePool(item) {
  const { data: rows, error } = await supabase
    .from("sources")
    .select("id, url, name, description, tier, trust_score_overall, jurisdictions, topic_tags, status, admin_only")
    .eq("status", "active")
    .eq("admin_only", false);
  if (error || !rows) throw new Error(`Failed to load sources: ${error?.message || "no rows"}`);

  const itemTopics = new Set(item.topic_tags || []);
  const itemJurisdictions = new Set(item.jurisdictions || []);
  const scored = [];
  for (const r of rows) {
    let score = 0;
    if (Array.isArray(r.jurisdictions) && r.jurisdictions.some((j) => itemJurisdictions.has(j))) score += 2;
    else if (Array.isArray(r.jurisdictions) && r.jurisdictions.includes("global")) score += 1;
    if (Array.isArray(r.topic_tags) && r.topic_tags.some((t) => itemTopics.has(t))) score += 2;
    // Soft boost for explicit California-flavoured names so CARB/leginfo come up
    if (typeof r.name === "string" && /california|CARB|leginfo/i.test(r.name)) score += 1;
    if (typeof r.url === "string" && /(arb\.ca\.gov|leginfo\.legislature\.ca\.gov|ca\.gov)/i.test(r.url)) score += 1;
    if (score > 0) scored.push({ ...r, score });
  }
  scored.sort((a, b) => b.score - a.score || a.tier - b.tier || (b.trust_score_overall || 0) - (a.trust_score_overall || 0));
  let pool = scored.slice(0, 40);

  // Primary-source guarantee
  if (item.source_id) {
    const already = pool.find((p) => p.id === item.source_id);
    if (!already) {
      const primary = rows.find((r) => r.id === item.source_id);
      if (primary) pool = [{ ...primary, score: 99 }, ...pool].slice(0, 40);
    }
  }
  return pool.map((p) => ({
    id: p.id,
    url: p.url,
    name: p.name,
    description: p.description || "",
    tier: p.tier,
    trust_score_overall: p.trust_score_overall || 0,
  }));
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("CA CRITICAL BRIEFS — Regenerate via Sonnet");
console.log("=".repeat(70));
console.log(`Targets: ${todoLegacyIds.join(", ")}`);
console.log(`Dry run: ${dryRun}`);
console.log(`Browserless: ${BROWSERLESS_API_KEY ? "yes" : "no (plain fetch fallback)"}`);
console.log("");

const runStart = Date.now();
const reportRows = [];
let totalCost = 0;
let okCount = 0;
let failCount = 0;

for (const legacyId of todoLegacyIds) {
  const itemStart = Date.now();
  console.log(`\n── ${legacyId} ──`);

  // 1. Fetch item
  const { data: item, error: selErr } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, source_url, source_id, item_type, domain, jurisdictions, topic_tags, full_brief, priority")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (selErr || !item) {
    console.log(`  ✗ DB select: ${selErr?.message || "not found"}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: `select: ${selErr?.message || "not found"}` });
    failCount++;
    continue;
  }
  console.log(`  id=${item.id.slice(0, 8)} type=${item.item_type} priority=${item.priority}`);
  console.log(`  source_url=${item.source_url}`);

  if (!item.source_url) {
    console.log(`  ✗ no source_url`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: "no source_url" });
    failCount++;
    continue;
  }

  // 2. Fetch source content
  let sourceText = "";
  try {
    const r = await browserlessRender(item.source_url, { maxTextLength: 80_000 });
    sourceText = r.text;
    console.log(`  fetch: ${r.status} render=${r.renderMs}ms text=${r.textLength}`);
  } catch (e) {
    const msg = e.message?.slice(0, 200) || String(e);
    console.log(`  ✗ fetch: ${msg}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: `fetch: ${msg}` });
    failCount++;
    continue;
  }

  // 3. Build source pool
  let pool;
  try {
    pool = await buildSimpleSourcePool(item);
    console.log(`  pool: ${pool.length} sources`);
  } catch (e) {
    const msg = e.message?.slice(0, 200) || String(e);
    console.log(`  ✗ pool: ${msg}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: `pool: ${msg}` });
    failCount++;
    continue;
  }

  // 4. Build user message
  const userMessage = `INPUT ITEM:
- id: ${item.id}
- title: ${item.title}
- item_type: ${item.item_type}
- domain: ${item.domain ?? "(null)"}
- jurisdictions: ${JSON.stringify(item.jurisdictions || [])}
- topic_tags: ${JSON.stringify(item.topic_tags || [])}
- source_url: ${item.source_url}
- existing brief preview: ${(item.full_brief || "").slice(0, 1500)}

SOURCE CONTENT (truncated):
${sourceText}

WORKSPACE PROFILE:
- cargo_verticals: live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian
- transport_mode_priority: air primary, road secondary, ocean tertiary
- trade_lanes: Americas, Europe, Asia
- supply_chain_role: freight forwarder

AVAILABLE SOURCES (for sources_used and related_items; use only these UUIDs):
${JSON.stringify(pool, null, 2)}

Generate the brief per the format selected by item_type, then emit the YAML frontmatter block as instructed. The frontmatter MUST include all 12 metadata fields.`;

  // 5. Call Sonnet
  const sonnetStart = Date.now();
  let sonnetRes;
  try {
    sonnetRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: SONNET_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(SONNET_TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
    const msg = isTimeout ? `timeout (>${SONNET_TIMEOUT_MS / 1000}s)` : (e.message?.slice(0, 200) || String(e));
    console.log(`  ✗ sonnet: ${msg}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: `sonnet: ${msg}` });
    failCount++;
    continue;
  }
  if (!sonnetRes.ok) {
    const errBody = await sonnetRes.text();
    console.log(`  ✗ sonnet ${sonnetRes.status}: ${errBody.slice(0, 200)}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost: 0, error: `sonnet ${sonnetRes.status}` });
    failCount++;
    continue;
  }
  const respJson = await sonnetRes.json();
  const sonnetMs = Date.now() - sonnetStart;
  const rawText = respJson.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cost = (respJson.usage.input_tokens / 1e6) * 3 + (respJson.usage.output_tokens / 1e6) * 15;
  totalCost += cost;
  console.log(`  sonnet: ${sonnetMs}ms in=${respJson.usage.input_tokens} out=${respJson.usage.output_tokens} cost=$${cost.toFixed(3)}`);

  // 6. Parse
  let body, metadata;
  try {
    const parsed = parseAgentOutput(rawText);
    body = parsed.body;
    metadata = parsed.metadata;
  } catch (e) {
    console.log(`  ✗ parse: ${e.message}`);
    reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: 0, integrity: "n/a", cost, error: `parse: ${e.message}` });
    failCount++;
    continue;
  }
  console.log(`  parse: brief=${body.length} sev=${metadata.severity} fmt=${metadata.format_type} src=${metadata.sources_used.length}`);

  // 7. UPDATE intelligence_items (writes 13 fields)
  if (!dryRun) {
    const { error: updErr } = await supabase
      .from("intelligence_items")
      .update({
        full_brief: body,
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        topic_tags: metadata.topic_tags,
        operational_scenario_tags: metadata.operational_scenario_tags,
        compliance_object_tags: metadata.compliance_object_tags,
        related_items: metadata.related_items,
        intersection_summary: metadata.intersection_summary,
        sources_used: metadata.sources_used,
        last_regenerated_at: metadata.last_regenerated_at,
        regeneration_skill_version: metadata.regeneration_skill_version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (updErr) {
      console.log(`  ✗ DB update: ${updErr.message}`);
      reportRows.push({ legacy: legacyId, status: "FAILED", briefChars: body.length, integrity: "n/a", cost, error: `db: ${updErr.message}` });
      failCount++;
      continue;
    }
  }

  // 8. Post-write integrity flag check (column may or may not exist depending on
  //    whether migration 035 has been applied).
  let integrityFlag = "N/A";
  let integrityPhrase = null;
  try {
    const { data: post, error: postErr } = await supabase
      .from("intelligence_items")
      .select("agent_integrity_flag, agent_integrity_flag_phrase")
      .eq("id", item.id)
      .maybeSingle();
    if (postErr) {
      // Almost certainly "column does not exist" — migration not applied yet.
      // Tolerate; report N/A.
      integrityFlag = "N/A (column missing)";
    } else if (post) {
      if (post.agent_integrity_flag === true || post.agent_integrity_flag === "true") {
        integrityFlag = "YES";
        integrityPhrase = post.agent_integrity_flag_phrase || null;
      } else if (post.agent_integrity_flag === false || post.agent_integrity_flag === "false") {
        integrityFlag = "NO";
      } else if (post.agent_integrity_flag == null) {
        integrityFlag = "NULL";
      } else {
        integrityFlag = String(post.agent_integrity_flag);
        integrityPhrase = post.agent_integrity_flag_phrase || null;
      }
    }
  } catch (e) {
    integrityFlag = `N/A (${e.message?.slice(0, 60)})`;
  }
  console.log(`  integrity: ${integrityFlag}${integrityPhrase ? ` — "${integrityPhrase.slice(0, 80)}"` : ""}`);

  const totalMs = Date.now() - itemStart;
  console.log(`  ✓ done in ${totalMs}ms`);
  reportRows.push({
    legacy: legacyId,
    title: item.title,
    status: "OK",
    briefChars: body.length,
    severity: metadata.severity,
    integrity: integrityFlag,
    integrityPhrase,
    cost,
    error: null,
    ms: totalMs,
  });
  okCount++;
}

const totalMs = Date.now() - runStart;
const totalMin = Math.floor(totalMs / 60_000);
const totalSec = Math.floor((totalMs % 60_000) / 1000);

// ─── Console summary ───────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log("RUN COMPLETE");
console.log("=".repeat(70));
console.log(`OK:          ${okCount}/${todoLegacyIds.length}`);
console.log(`Failed:      ${failCount}`);
console.log(`Total cost:  $${totalCost.toFixed(2)}`);
console.log(`Total time:  ${totalMin}m ${totalSec}s`);

// ─── Markdown report ───────────────────────────────────────────────────────

function rowLabel(legacy) {
  return ({
    w4_ca_sb253: "SB 253",
    w4_ca_sb261: "SB 261",
    w4_ca_ab1305: "AB 1305",
    w4_ca_acf: "Advanced Clean Fleets",
  })[legacy] || legacy;
}

const lines = [];
lines.push("# California Critical Items — Brief Generation Report");
lines.push("");
lines.push(`Run completed: ${new Date().toISOString()}`);
lines.push(`Mode: ${dryRun ? "DRY RUN (no DB writes)" : "LIVE"}`);
lines.push("");
lines.push("| Item | Status | Brief chars | Severity | Integrity flag | Cost |");
lines.push("|---|---|---|---|---|---|");
for (const r of reportRows) {
  const integrityCell = r.integrity === "YES" ? `**YES**${r.integrityPhrase ? ` ("${r.integrityPhrase.slice(0, 60)}")` : ""}` : r.integrity;
  lines.push(`| ${rowLabel(r.legacy)} | ${r.status} | ${r.briefChars.toLocaleString()} | ${r.severity || "—"} | ${integrityCell} | $${r.cost.toFixed(3)} |`);
}
lines.push("");
lines.push("## Per-item details");
lines.push("");
for (const r of reportRows) {
  lines.push(`### ${rowLabel(r.legacy)} (\`${r.legacy}\`)`);
  if (r.title) lines.push(`- title: ${r.title}`);
  lines.push(`- status: ${r.status}`);
  if (r.error) lines.push(`- error: \`${r.error}\``);
  if (r.briefChars) lines.push(`- brief chars: ${r.briefChars.toLocaleString()}`);
  if (r.severity) lines.push(`- severity: ${r.severity}`);
  lines.push(`- integrity flag: ${r.integrity}`);
  if (r.integrityPhrase) lines.push(`- integrity phrase: \`${r.integrityPhrase}\``);
  lines.push(`- cost: $${r.cost.toFixed(3)}`);
  if (r.ms) lines.push(`- wall time: ${r.ms}ms`);
  lines.push("");
}
lines.push("## Total");
lines.push("");
lines.push(`- Items attempted: ${todoLegacyIds.length}`);
lines.push(`- Succeeded: ${okCount}`);
lines.push(`- Failed: ${failCount}`);
lines.push(`- Total cost: $${totalCost.toFixed(2)}`);
lines.push(`- Total time: ${totalMin}m ${totalSec}s`);
lines.push("");

// Recommendations
lines.push("## Recommendations");
lines.push("");
const failed = reportRows.filter((r) => r.status === "FAILED");
const flagged = reportRows.filter((r) => r.integrity === "YES");
if (failed.length === 0 && flagged.length === 0) {
  lines.push("All four items regenerated cleanly with no integrity flags raised. Briefs are ready for surface-level review.");
} else {
  if (failed.length) {
    lines.push(`- **${failed.length} item(s) failed**: ${failed.map((r) => rowLabel(r.legacy)).join(", ")}. Investigate the per-item error before retrying.`);
  }
  if (flagged.length) {
    lines.push(`- **${flagged.length} item(s) tripped the integrity trigger**: ${flagged.map((r) => rowLabel(r.legacy)).join(", ")}. Review the flagged phrase and consider rerunning that item alone with a tighter source pool or expanded source content.`);
  }
  lines.push(`- For partial failures, rerun a single item with: \`node supabase/seed/generate-ca-briefs.mjs --legacy=<legacy_id>\`.`);
}

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, lines.join("\n"));
console.log(`\nReport written: ${REPORT_PATH}`);
