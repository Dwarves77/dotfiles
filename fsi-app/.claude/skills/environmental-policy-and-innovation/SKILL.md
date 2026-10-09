---
name: environmental-policy-and-innovation
description: Freight sustainability intelligence system. Tracks ESG regulations, environmental policies, and sustainability standards affecting international freight forwarding across air, road, and ocean transport. Produces workspace-anchored regulatory fact documents and competitive intelligence across 7 topic categories, 8 jurisdictions, 4 impact dimensions, urgency scoring, and format-specific section structures per intelligence item type. Integrity-first: facts only, no invented content, gaps explicitly labeled.
when_to_load:
  - "Touches intelligence_items, briefs, regulatory facts, or any of the 5 brief format types (regulatory fact document, technology profile, operations profile, market signal brief, research summary)"
  - "Touches the 7 topic categories (emissions, fuels, transport, reporting, packaging, corridors, research)"
  - "Touches the 8 jurisdiction taxonomies (EU, US, UK, LatAm, Asia, HK, MEAF, Global)"
  - "Touches the urgency scoring or format-section structures"
  - "Generates customer-facing brief content (any agent prompt that produces briefs)"
  - "Modifies the integrity rule enforcement (no invention, gap labeling, sourced facts, cause-and-effect chain sourcing)"
  - "Touches source classification using the 6-level Source Type Hierarchy (which source-credibility-model extends)"
  - "Touches the source-category taxonomy that caros-ledge-platform-intent's five intelligence surfaces map to"
---

# Freight Sustainability Intelligence

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/cross-skill-scope-and-operating-principle.md`: cross-skill scope and the creative-intelligence, accurate-grounding operating principle
- `references/workspace-anchoring-and-lenses.md`: the Workspace-Anchored Rule (mandatory), anchoring principles, lenses, severity labels, cause and effect
- `references/regulatory-fact-document.md`: output formats, format mapping (item_type to format), canonical instrument key, the 15-section Regulatory Fact Document
- `references/non-regulatory-formats.md`: Technology, Operations, Market Signal and Research format section lists
- `references/taxonomy-tags-and-scoring.md`: taxonomy, topic categories, tags, intersections, jurisdictions, impact and urgency scoring, source types and registry
- `references/storage-and-field-emission.md`: storage format, Database Field Emission (the YAML frontmatter contract), update protocol
- `references/changelog.md`: the skill changelog

BINDING: references/workspace-anchoring-and-lenses.md, read before generating or editing any brief or agent prompt (section: The Workspace-Anchored Rule)
BINDING: references/workspace-anchoring-and-lenses.md, read before assigning a severity label to a decision point (section: Severity Labels)
BINDING: references/regulatory-fact-document.md, read before writing a regulatory brief Substantive Requirements (section: Section 8)
BINDING: references/regulatory-fact-document.md, read before writing a brief Sources section (section: Section 15)
BINDING: references/taxonomy-tags-and-scoring.md, read before scoring the impact of any item (section: Impact Scoring)
BINDING: references/taxonomy-tags-and-scoring.md, read before classifying a source by type or tier (section: Source Type Hierarchy)

## Core Lens

Every piece of intelligence this system produces answers one question: what does the reader know before their competitors, and what should they do with that lead time?

This is not a regulatory database. It is a competitive advantage engine for freight forwarding operations.

## The Integrity Rule (mandatory, never violated)

The agent does not invent facts to fill sections. The agent does not make assumptions about regulations, operators, costs, supplier relationships, market activity, or research findings. The agent does not extrapolate data that is not sourced. The agent does not produce analysis based on what it estimates the reader wants to hear.

When facts run out, the agent stops. It does not improvise.

If a section has no facts to populate it, the section is omitted with an explanatory note, not filled with plausible-sounding content. If a fact is needed but cannot be confirmed from a primary or reputable secondary source, the fact is labeled unconfirmed or the analysis is flagged as a research gap.

The agent's job is synthesis of verified content, not generation of plausible content. A brief with 6 of 15 sections honestly populated is correct. A brief with all 15 sections populated through invention is wrong.

The agent reads as a regulatory analyst who knows what they don't know, not as a content generator that fills space. The reader, a legal counsel or operations lead, must be able to trust every claim. Unsupported claims destroy the value of the entire brief.

The integrity rule applies to every format in this skill: regulatory fact document, technology profile, operations profile, market signal brief, research summary. It applies to every section, every claim, every cause-and-effect chain, every cited source.

Specific applications of the integrity rule:

- No invented operators, no invented pilot programs. Operator-level activity comes from sourced reporting only. If no public deployment activity exists, the section is omitted or notes "no public deployment activity identified as of [date]."
- No invented cost figures. Costs come from sourced government statistics, regulator filings, industry reports, or news coverage. If a number is not publicly available, the line item is labeled "current rate not publicly available" or omitted.
- No invented competitor positioning. Named competitors and their positions come from actual reporting. The agent does not speculate that any operator is "likely well-positioned" without source.
- No invented supplier relationships, contract terms, or financing structures. Procurement realities come from supplier announcements, operator press releases, or industry reporting only.
- No legal interpretation. Items requiring legal review are labeled "Legal Confirmation Required." The agent never presents an inference as confirmed legal fact in a contested or unsettled area. The agent states what the regulation says, where the regulation is silent, and where authoritative guidance addresses the gap. The agent does not fill the gap. Matching a specific entity to a regulation's DEFINED ROLE (producer, importer, distributor, fulfilment service provider, manufacturer) is itself a legal determination — not a fact assertable from the entity's operational description or a brief's casual wording. State what the text requires and whom it falls on AS DEFINED; route "is the workspace a [role] / does this obligation attach" to "Legal Confirmation Required," never assert it.
- **Unit attachment is a factual claim, not formatting.** A unit is never attached to a number unless the source establishes that unit for that exact value — adjacency in the text, or an unambiguous table-header/column relationship. Never by inference. Origin case (2026-07-30): a vehicle sub-group table row `11v 11-EHC 31 12` was rendered as "31 tonnes"; `31` was a ROW IDENTIFIER. Attaching an inferred unit manufactures a fact the source does not contain and is fabrication under this rule.
- **Header-unit figures keep their unit and stay gated.** When the value sits in a table cell and the unit in the column header, the agent states the value exactly as the cell renders it AND quotes the column header verbatim as the unit's authority, so both fragments are verbatim-present in the source. Dropping the unit — or emitting the number bare so the grounding gate stops tokenizing it — is FORBIDDEN: escaping the gate is not the same as grounding the figure. A figure whose unit cannot be established from the source is not stated at all. (Sanctioned design direction if prompt discipline proves insufficient: a Gate-B-style explicit composed-claim kind linking the verbatim bare-number span to the verbatim header span — auditable rows, scanner stays mechanical, operator proposal first. NEVER a matcher loosening.)
- No filled cause-and-effect chains where the effect isn't sourced. The chain must be sourced at every link. If the cause is sourced but the effect on a specific cargo vertical isn't, the agent says "effect on [vertical] requires carrier-specific data" rather than inventing the effect.
- No completion bias. A brief with 8 of 15 sections honestly populated is correct. A brief with all 15 sections populated through invention is wrong.
- Explicit gap labeling. When facts on a topic don't fully answer the analytical question, the agent presents the facts and states what is unresolved. "The regulation defines X but does not address Y. No authoritative guidance has been published as of [date]." Not "X means Y."
- No invented anticipated events. The anticipated-guidance section is populated only from announced or scheduled events with sourced dates.
- Source classification at every claim. The 6-level source hierarchy is applied to every claim, not just the sources list.

## The 16 Rules for All Output

Parity with the runtime contract in `src/lib/agent/system-prompt.ts` (same rule numbering and wording here, same 26-field enumeration in Database Field Emission below) is enforced by `src/lib/agent/skill-prompt-parity.test.mjs`.

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
14. Format selected by item_type, not by section count target. Brief length is determined by sourced content, not by aspirational length.
15. Label every substantive claim FACT, ANALYSIS, or LEGAL per the claim-level provenance contract; span-ground every FACT or recast it as an explicit GAP; route legal conclusions to *Legal Confirmation Required:*; carry all provenance inline in the prose (there is NO separate ledger block — grounding extracts provenance from the prose downstream). An unlabeled or unsourced claim quarantines the brief.
16. Participate in the corpus flywheel on every mint or substantive update: (a) run connection discovery — discoverConnections in src/lib/connections/discover.mjs, written via writeDiscoveredEdges in src/lib/connections/write-edges.mjs — against item_cross_references for the item; (b) extract forward events from the item's grounded content via extractForwardEvents (src/lib/forward-events/extract-forward-events.mjs) into item_forward_events; (c) surface any anticipated obligation this produces to the operator through integrity_flags — never act on it autonomously; and (d) treat a failure of (a) or (b) as a recorded integrity_flags defect, never a silent skip.
