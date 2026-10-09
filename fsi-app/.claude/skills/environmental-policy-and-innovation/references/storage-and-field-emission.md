## Storage Format

Briefs are stored as markdown in intelligence_items.full_brief. The markdown convention:

- Each section is a top-level heading (# Section Name)
- Section names match the format's section list exactly
- Sections that have no grounded content are omitted entirely OR carry a single-line note: "*No content for this section as of [date]: [reason].*"
- Inline citations use the format: *Source: [Title], [Issuing Body], [Date]. [URL if applicable].*
- Severity labels are written as the space-separated form (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING)
- Cause-and-effect chains use bullet structure: cause sentence, mechanical-consequence sentence, effect-by-vertical sentences
- The workspace is referenced as "the workspace" or "workspaces in [role]" or by operational profile, never by name

This convention enables consistent display in the UI and enables a future schema migration to extract structured fields from the markdown reliably.

## Database Field Emission (YAML frontmatter contract)

Every regeneration writes the **26-field contract** to `intelligence_items`: `full_brief` plus the 25 other fields emitted as a YAML frontmatter block at the very end of the markdown output, after any `New Sources Identified` section. Downstream code (`writeSynthesizedBrief`, the single write site extracted from `synthesiseAndWriteBrief` in `src/lib/agent/canonical-pipeline.ts`) parses the YAML, maps each CHECK-constrained field to its live DB vocabulary (`src/lib/agent/metadata-vocab.ts`), and writes the row; an absent/malformed YAML block, or a metadata write rejected by a constraint, is a failed regeneration (fail-loud, never a silent partial write).

Fields:

- `full_brief` — the markdown body of the brief, structured per the format type's section list. Already produced as the body of the agent's output.
- `what_is_it` — plain language explanation citing the specific legal instrument (directive/regulation number, Official Journal reference, state register citation, port authority tariff number), jurisdiction, and enforcement body. 2-3 sentences minimum. For non-regulatory formats, name what the thing IS (report, disclosure, standard, dataset, programme) and who issued it, on the same evidentiary terms. Emit on EVERY brief regardless of format. This field is a COMPRESSION of the brief you just wrote, never new claims: every element must already appear in the body or its cited sources. Under the integrity rule, emit null rather than a plausible sentence when the brief itself could not establish what the instrument is.
- `severity` — one of the 5 severity labels. Reflects the urgency of action implied by the brief's content as it actually exists, not as it would exist if all sections were filled. Briefs that honestly omit sections under the integrity rule still emit severity, scoped to what is known and sourced.
- `priority` — the 4-tier dashboard counter value, computed from severity per the locked mapping below. The agent computes this; downstream code does not.
- `urgency_tier` — the dashboard tier value, one of `watch`, `elevated`, `stable`, `informational`.
- `format_type` — the format used for this brief, derived from `item_type` per the locked mapping below.
- `topic_tags` — array of 0-3 values from the 7 Topic Categories controlled vocabulary above. Reflects what the brief actually covers, not what it nominally is named after. Emitted as a YAML inline array. Empty array allowed when the item genuinely fits none of the seven (rare). Tags outside the vocabulary fail the regeneration.
- `signal_band` — one of `price | corporate | corridor` when format_type is `market_signal_brief`; null otherwise. Drives /market band routing column-first.
- `theme` — one of the 7 research-theme values (`emissions_accounting | fuels_saf | packaging_circular | carbon_markets | cold_chain_art | last_mile_electrification | disclosure_regimes`) when format_type is `research_summary`; null otherwise. Drives /research theme routing column-first. The single most central theme; distinct from topic_tags which is multi-value and uses a DIFFERENT vocabulary.
- `operational_scenario_tags` — array of 0-5 values describing operational scenarios the item touches. Prefer the core glossary in the Operational Scenario Tags section above; new values allowed when the core doesn't fit. Lower-case kebab-case. Drives intersection detection.
- `compliance_object_tags` — array of 0-4 values from the closed Compliance Object Tags glossary above. Tags outside the glossary fail the regeneration. Drives intersection detection.
- `related_items` — UUID array of intelligence_items the agent recognised as related during composition. Every UUID must satisfy the A3 assertion rule: from the source pool input, or from the CANDIDATE CONNECTIONS block when the brief's content genuinely evidences it. No invented UUIDs, no other source. Empty array when no relations identified.
- `intersection_summary` — short markdown string (≤1500 chars) describing how this item interacts with the linked items. Sourced; cite linked items inline by title. Empty string OR null when no intersections were identified.
- `sources_used` — UUID array of source IDs the agent referenced. Populated only with IDs that arrived in the input context. No invented UUIDs. Emit FULL 36-character UUIDs — never the 8-character prefix shorthand. Truncated UUIDs fail the regeneration.
- `last_regenerated_at` — ISO 8601 timestamp at the moment of generation. Current UTC timestamp in ISO 8601 form (e.g., `2026-04-28T18:42:00Z`). Never `NOW()`, never a placeholder, never derived from source publication dates.
- `regeneration_skill_version` - fixed string identifying the SKILL.md contract version. For regenerations under the current contract, the value is `"2026-09-11"` (see `src/lib/agent/contract-version.mjs`, the single source of truth `contract-version.test.mjs` binds this file's stamped value to).
- `what_it_changes` — short editorial callout (single sentence, 80-200 chars) naming what this finding/signal changes for workspace operations: cost mechanism, contract clause, routing decision, compliance action, etc. Emit on EVERY brief regardless of format. Empty string OR null only when the brief has no operational implications (rare; integrity-rule exception). The renderer surfaces this as a per-card right-column callout on /research and /market.
- `does_not_resolve` — short editorial callout (single sentence, 80-200 chars) naming the scope limit, open question, or unresolved aspect this brief deliberately does not address. Emit on research_summary briefs ONLY (and ideally only when an open question is genuinely surfaced); null otherwise. Format: short prose ("Does NOT resolve whether [open question] — see [pending source/event] for binding answer"). Renderer surfaces as a muted secondary callout under "What it changes".
- `conversion_trigger` — short editorial callout (single sentence, 80-200 chars) naming the future event that flips this signal from observation to commercial pressure. Emit on market_signal_brief items in signal_band price OR corporate; null otherwise. Format: short prose ("CORSIA Phase 2 review · Q4 2026" or "First commercial pilot 2028 · charging-corridor agreement signing"). Renderer surfaces as a muted secondary callout.
- `cross_references` — short editorial callout (single sentence, 80-200 chars) listing canonical Operations/Regulations briefs this corridor signal links to. Emit on market_signal_brief items in signal_band corridor; null otherwise. Format: short prose with "↗" arrow prefix per surface ("↗ Operations · Gulf bunkering · Cape route economics"). Renderer surfaces as a callout block beneath What it changes.
- `cost_mechanism` - one sentence naming who is obligated and how the cost reaches a forwarder's invoice (surcharge, levy, allowance cost, penalty, or pass-through). regulatory_fact_document format only; null on every other format. Verbatim-grounded: emit only when the cited source states the mechanism, never inferred or estimated. Read by RegulationDetailSurface's Who-pays cell.
- `penalty_range` - the specific penalty amount or range, verbatim from the source's S3/S8 penalty_summary material. regulatory_fact_document format only; null otherwise, including when the source states no penalty exists. Renders in PenaltyFacts alongside enforcement_body.
- `enforcement_body` - the name of the body that enforces the instrument, verbatim from the source's S3/S8 penalty_summary material. regulatory_fact_document format only; null otherwise. Renders in PenaltyFacts alongside penalty_range.
- `requirement_trajectory` - the instrument's per-year requirement path as inline JSON, the same qualification-capture per-year series S8 already demands in prose. Shape: `{ "steps": [{"date": "YYYY" or "YYYY-MM-DD", "value": "a string, e.g. 40%", "label": "optional"}, ...], "note": "optional free text" }`. regulatory_fact_document format only; null when the instrument has no phase-in or step series. Deliberately distinct from `trajectory_points` above, which is a numeric price series for market_signal_brief items in signal_band price; this is a qualitative per-year requirement path.
- `why_matters` - 3-4 sentences minimum on how this item affects freight forwarding operations: pricing, procurement, carrier contracts, customer reporting, customs processes, or route planning. Include specific cost mechanisms with real figures or ranges when known. No generic "this is important" language. Emit on EVERY brief regardless of format.
- `key_data` - array of hard data points: effective dates, penalty amounts, phase-in percentages, tonnage thresholds, compliance deadlines. Every entry must be specific and sourced. Emitted as a YAML inline array. Empty array allowed when the brief has no standalone data points beyond what full_brief already states. Emit on EVERY brief regardless of format.

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

Emission format. The agent appends the YAML frontmatter block at the very end of the markdown output, after any `New Sources Identified` section, fenced with `---` delimiters. The block is NOT wrapped in markdown code fences (no triple-backtick `yaml`). The block stands alone with its `---` delimiters as the only fences. Example:

```
---
severity: ACTION REQUIRED
priority: CRITICAL
urgency_tier: watch
format_type: regulatory_fact_document
topic_tags: [emissions, reporting]
signal_band: null
theme: null
operational_scenario_tags: [CBAM-declaration, carbon-border-adjustment, emissions-reporting-Scope3]
compliance_object_tags: [importer, customs-broker, manufacturer-producer]
related_items: [b3c4d5e6-f7a8-4901-2345-678901234567]
intersection_summary: "Overlaps with EU ETS for shipping (linked) on emissions-reporting-Scope3; CBAM declarants importing covered goods that arrived via EU-ETS-priced ocean freight face dual reporting obligations on the same emission units."
sources_used: [a1b2c3d4-e5f6-4789-9abc-def012345678, fedcba98-7654-4321-0fed-cba987654321]
last_regenerated_at: 2026-08-31T18:42:00Z
regeneration_skill_version: "2026-09-11"
what_it_changes: "CBAM Q1 2026 reporting deadline tightens — early importers face €1.5M cost exposure pre-Q4 pass-through"
does_not_resolve: null
conversion_trigger: null
cross_references: null
cost_mechanism: "Importers pay a CBAM certificate surcharge on the carbon content declared at customs clearance."
penalty_range: "EUR 10 to EUR 50 per tonne CO2e of undeclared embedded emissions"
enforcement_body: "European Commission, Directorate-General for Taxation and Customs Union"
requirement_trajectory: {"steps":[{"date":"2026-01-01","value":"purchase obligation begins","label":"certificate phase-in starts"},{"date":"2034-01-01","value":"100%","label":"full certificate obligation, free allocation phased out"}],"note":"phase-in mirrors the parallel EU ETS free-allocation phase-out"}
why_matters: "CBAM certificate purchase obligations begin 2026-01-01, adding a direct per-tonne cost to covered imports that was previously absorbed by free EU ETS allocation. Forwarders handling CBAM goods must budget for the certificate surcharge in freight cost quotes and flag declarant obligations to importer clients ahead of the phase-in."
key_data: ["Certificate purchase obligation begins 2026-01-01", "Full obligation (100%) from 2034-01-01", "Penalty EUR 10 to EUR 50 per tonne CO2e of undeclared emissions"]
---
```

The metadata block is mandatory on every regeneration. An absent or malformed block is a failed regeneration.

## Update Protocol

When the user says "update the skill," the agent:

1. Web searches all sources in the priority registry above
2. Identifies what changed since the last update
3. For each change: specifies what changed, previous state, new state, severity label, affected transport modes and cargo verticals, cost impact range
4. Applies cause-and-effect chain to every finding
5. Adds any new credible sources discovered during search
6. Flags any source conflicts as disputes
7. Generates an updated version of this SKILL.md file with current intelligence, expanded source list, and dated changelog
8. Delivers as a downloadable file for upload to /mnt/skills/user/environmental-policy-and-innovation/
