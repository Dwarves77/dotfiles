---
name: writer-regulatory-fact-document
description: Generates the 14-section regulatory fact document for item_type IN (regulation, directive, standard, guidance, framework). The format is conditional: 8 sections are always present, 6 are conditional and omitted when ungrounded. A regulation with no authoritative guidance, no anticipated events, no threshold questions in dispute, no workspace-specific products, no exemptions, no adjacent research publishes with 8 of 14 sections — that is correct, not a defect. Emits markdown body for intelligence_items.full_brief plus the 13-field YAML metadata block via writer-yaml-emission.
---

# Writer: Regulatory Fact Document

## Purpose

Generates the long-form `full_brief` for items typed as binding instruments (regulation/directive/standard/guidance/framework). Output is markdown stored in `intelligence_items.full_brief`. The structure follows the 14-section spec preserved from the original `environmental-policy-and-innovation` skill lines 182-303 (archived at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`).

The reader question this writer answers: **what does this regulation require, where does the workspace sit in the compliance chain, what is decided versus what is unresolved, and what does the workspace do now?**

## When to use

When `item_type IN (regulation, directive, standard, guidance, framework)` and the item is being regenerated. Per [[classifier-page-routing]] decision.

## When NOT to use

- `item_type IN (technology, innovation, tool)` → [[writer-technology-profile]]
- `item_type = regional_data` → [[writer-operations-profile]]
- `item_type IN (market_signal, initiative)` → [[writer-market-signal-brief]]
- `item_type = research_finding` → [[writer-research-summary]]

## Inputs

- `intelligence_items` row (id, title, item_type, source_id, status, structured facts)
- `sources` row joined via source_id
- AVAILABLE SOURCES pool (related items + cross-referenced sources for this regeneration; see [[rule-synthesis-from-primary-sources]] for the active synthesis discipline)
- Workspace profile (verticals, modes, lanes, supply chain role) from `workspace_settings`

## Outputs

- Markdown body for `intelligence_items.full_brief`
- 13-field YAML metadata block via [[writer-yaml-emission]]

## The 14 sections

**Always present (8): 1, 2, 3, 4, 8, 10, 11, 14, 15.**
**Conditional (6): 5, 6, 7, 9, 12, 13** — omitted when ungrounded with a one-line explanatory note.

The integrity contract: a brief honestly omitting conditional sections is correct. A brief with all 14 sections populated through invention is wrong. The honest 8-of-14 brief is the success case for a regulation with no authoritative guidance yet, no anticipated events, no threshold disputes, no workspace-specific products in scope, no exemptions, no adjacent research.

### Section 1: Purpose and Scope of This Document (always)

What this document covers: the regulation, its identifier, its jurisdiction. Convention notes: which items require legal confirmation; which items are industry operator interpretation versus legal authority; which items are sourced from authoritative guidance. Date of document. Date of regulation publication. Date of next scheduled review.

Anchor framing: open with the regulation's plain-language identifier and its jurisdiction. The reader should know within the first sentence what regulation this brief covers.

### Section 2: What This Regulation Is and Why It Applies to the Workspace (always)

The regulation in plain language: who issued it, what it requires, when it takes effect. Why it matters to the workspace's operations, filtered by workspace profile:
- Which cargo verticals are affected (named explicitly from the workspace's vertical list)
- Which transport modes are affected
- Which trade lanes are affected
- Which supply chain roles the workspace occupies that are in scope

Per [[rule-workspace-anchored-output]]: reference the workspace generically (the workspace, workspaces in [role], operators in the [vertical] vertical), never by name.

### Section 3: Issues Requiring Immediate Action (always)

What the workspace must decide or do now OR within 30 days. SPECIFIC actions, not "be aware of."

Each action carries:
- Severity label per [[vocabulary-severity-labels]] (ACTION REQUIRED for 30-day decision pressure; COST ALERT for cost-change actions; WINDOW CLOSING for expiring opportunities; COMPETITIVE EDGE for first-mover positioning; MONITORING for forward-looking awareness without immediate pressure)
- Action verb first (per [[rule-fsi-brief-framework]])
- Cost or consequence stated concretely or as directional range (per [[rule-no-speculation-as-fact]])
- Deadline

If no 30-day decision pressure exists for the workspace, the section honestly notes "no immediate action required for [workspace's vertical/mode profile] as of [date]" rather than padding with generic monitoring tasks.

### Section 4: How the Workspace Sits in the Compliance Chain (always)

The supply chain roles the regulation defines (manufacturer, importer, distributor, fulfillment provider, freight forwarder, carrier, customs broker, etc.) and the role the workspace occupies in each transaction type. Different transactions may place the workspace in different roles. Each role carries distinct obligations.

This section maps the workspace's role profile against the regulation's role taxonomy and identifies where legal must confirm role placement.

Per [[rule-no-regulatory-inferences-as-fact]]: role placement that is ambiguous or contested is labeled "Legal Confirmation Required" explicitly, not asserted.

### Section 5: Authoritative Guidance Document Analysis (conditional)

When authoritative guidance exists (Commission implementing acts, regulator FAQs, agency interpretive bulletins), this section synthesizes the guidance section by section. Each provision quoted or paraphrased with citation. Each provision interpreted against the workspace's role and operations. Items requiring legal confirmation are labeled per [[rule-no-regulatory-inferences-as-fact]].

When authoritative guidance does not yet exist, this section is OMITTED with the explanatory note: "No authoritative guidance published as of [date]." If guidance is anticipated, Section 6 addresses it.

### Section 6: Anticipated Authoritative Guidance and Pending Regulatory Events (conditional)

Forward-looking events that will or may change the analysis. Each event includes:
- **Event type:** Commission implementing act, regulator guidance, court decision, technical working group report, consultation close, comitology committee, parliamentary review
- **Issuing body**
- **Expected date or window** (sourced)
- **What the event is expected to address**
- **What sections of this document are likely to update when the event materializes**
- **What the workspace should expect to need to decide or change in response**

When the event materializes, the system flags the document for update.

Per [[rule-synthesis-from-primary-sources]]: this section is where the active discipline of anticipated-guidance identification surfaces. If scheduling sources (regulator meeting calendars, comitology agendas, court dockets) signal that guidance is coming, this section populates with the sourced expected event. Omitted if no anticipated events are sourced.

### Section 7: Threshold Questions (conditional)

When the regulation requires interpretation of a threshold question that determines whether and how it applies ("what qualifies as packaging," "who is the manufacturer in this supply chain," "what counts as a covered emission"), this section presents:
- The threshold question, plain language
- The regulatory text that defines it
- The authoritative guidance that interprets it (if any)
- The application to the workspace's specific situation
- What is decided versus what requires legal confirmation

Omitted if no threshold questions exist or are unresolved.

### Section 8: Substantive Requirements (always; expands and contracts by regulation)

The regulation's SPECIFIC obligations applied to the workspace's operations. Subsections vary by regulation: reuse targets, recyclability, labeling, registration, reporting, declarations of conformity, technical documentation retention, etc. Each subsection identifies:
- The obligation
- The deadline
- The workspace's compliance status as of the document date
- The action required

This section ADAPTS to the regulation. A regulation imposing reuse targets has a "Reuse Requirements" subsection. A regulation imposing labeling has a "Labeling Requirements" subsection. The writer does NOT invent subsections that the regulation does not impose.

Per [[rule-cause-and-effect-chain]]: each substantive requirement carries the cause-mechanical consequence-effect-by-vertical chain. The canonical example structure (SAF mandate → fuel surcharge → per-vertical incidence) is the template.

### Section 9: Product-Specific Compliance Status (conditional)

When the workspace sells specific products under its own name and those products fall within the regulation's scope, this section addresses each product:
- Product description (anonymized per [[rule-workspace-anchored-output]])
- Material classification under the regulation
- Article-specific obligations that apply
- Current compliance status
- Outstanding questions requiring legal review

Omitted if the workspace sells no products within scope.

### Section 10: Registration and Reporting Obligations (always)

EPR registration, producer registration, jurisdictional reporting requirements the regulation imposes. For each:
- Deadline
- Format (where published)
- Data the workspace must collect
- Registration scope (per Member State, per jurisdiction, etc.)

When registration formats have been promised but not yet published, this section notes the gap and identifies what monitoring is required. Per [[rule-no-speculation-as-fact]]: if no registration obligations apply, the section says so explicitly with a one-line note rather than being padded.

### Section 11: Operational System Requirements (always)

What the regulation requires the workspace to BUILD or MODIFY operationally. Tracking systems, reporting infrastructure, training programs, supplier onboarding processes, contractual modifications. Each requirement:
- Scope
- Deadline
- Gap between current operational baseline and what the regulation requires

The gap framing is workspace-specific (per [[rule-workspace-anchored-output]]) but the operational baseline is generic ("for workspaces operating manual case management without serial-level identification, the gap to Annex VI tracking requirements is fundamental").

### Section 12: Exemptions and Edge Cases (conditional)

When the regulation provides exemptions, transition periods, or edge cases relevant to the workspace's operations, this section identifies each:
- The exemption
- Conditions for qualifying
- Documentation or evidence required to claim it

Omitted if no exemptions apply or are sourced.

### Section 13: Adjacent Industry Research and Alternatives (conditional)

When industry research, alternative approaches, or emerging compliance strategies are publicly documented:
- Alternative materials being evaluated
- Alternative compliance pathways being piloted
- Industry coalitions developing harmonized approaches

Omitted if no adjacent research is sourced. Per [[rule-source-tier-hierarchy]]: research cited here is labeled by tier; industry body interpretation is labeled separately from regulator guidance.

### Section 14: Confirmed Regulatory Timeline (always)

Dated milestones with specific obligations. Each milestone:
- Date
- What the workspace must have done by that date
- What goes into effect on that date
- Source

Use bullet points or a table. Past milestones noted as "in force as of [date]." Future milestones noted with their conditional triggers if any.

### Section 15: Sources (always)

Full source list with type labels per [[rule-source-tier-hierarchy]]:
- Binding law and regulation (primary text)
- Regulator guidance and interpretive bulletins
- Intergovernmental body positions
- Industry body interpretation (labeled as such)
- News reporting
- Analysis and opinion (labeled as such)

Each source: title, issuing body, date, URL.

## Conditional section application

Sections 5, 6, 7, 9, 12, 13 are conditional. They appear only when grounded content exists. Section 8 expands or contracts based on the regulation's substantive scope. Sections 1, 2, 3, 4, 10, 11, 14, 15 are always present.

A new regulation with no authoritative guidance, no anticipated events, no threshold questions in dispute, no workspace-specific products, no exemptions, and no adjacent research, publishes with 8 of 14 sections (1, 2, 3, 4, 8, 10, 11, 14, 15). **That is correct.** The brief is honest about what is known.

## Inherits

Non-optional, applied at every section emission:

- [[rule-no-regulatory-inferences-as-fact]] (legal-counsel caveats on every imperative compliance instruction at the surface where it appears)
- [[rule-no-speculation-as-fact]] (every specific number/date/dollar requires inline source or sources_used entry)
- [[rule-source-traceability-per-claim]] (per-claim attribution at the card surface, not just in the brief)
- [[rule-cross-reference-integrity]] (dates in the brief match `entry_into_force` / `compliance_deadline` columns)
- [[rule-workspace-anchored-output]] (never name workspace, parent company, or person; framing driven by workspace's freight context)
- [[rule-fsi-brief-framework]] (action → cost → context ordering; four-lens requirement)
- [[rule-source-tier-hierarchy]] (T1-T7 weighting when sources conflict; label tier on every citation)
- [[rule-character-normalization]] (en/em dashes, smart quotes normalized at emission; § ¶ currency preserved)
- [[rule-synthesis-from-primary-sources]] (active synthesis discipline; Section 6 and Section 8 especially)
- [[rule-cause-and-effect-chain]] (every data point in Sections 3, 8, 11 carries cause + mechanical consequence + effect-by-vertical)
- [[vocabulary-severity-labels]] (Section 3 action items carry exactly one severity label)
- [[vocabulary-topic-tags]] (the closed 14-value list; emitted in YAML)
- [[vocabulary-compliance-objects]] (the closed 19-value list; emitted in YAML)
- [[reference-operational-scenarios]] (operational scenario tags emitted in YAML)
- [[reference-jurisdictions]] (canonical jurisdiction IDs used in jurisdiction emission)
- [[reference-priority-source-registry]] (sources cited here cross-checked against the registry)

## Output format

Markdown with section headings matching the format-spec list. Conditional sections omitted with a one-line explanatory note when ungrounded:

```markdown
# 5. Authoritative Guidance Document Analysis

*No content for this section as of 2026-05-15: no authoritative guidance has been published for this regulation. See Section 6 for anticipated events.*
```

Inline citations per [[rule-source-traceability-per-claim]]:

```markdown
*Source: ReFuelEU Aviation Regulation Article 4, EU Official Journal, in force as of 2024-01-25. https://eur-lex.europa.eu/eli/reg/2023/2405/oj*
```

Severity labels in space-separated form (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING).

## Failure modes to avoid

- All 14 sections populated through invention (the canonical integrity violation)
- Generic "monitor developments" actions in Section 3 (per [[rule-fsi-brief-framework]] action-language section)
- Missing legal-counsel caveats in Sections 4, 5, 7, 8 where regulatory inference appears (per [[rule-no-regulatory-inferences-as-fact]])
- Vertical-blind effect chains in Section 8 (per [[rule-cause-and-effect-chain]]: every effect link is sourced per vertical OR honestly labeled "requires carrier-specific data")
- Dates in narrative prose disagreeing with structured `entry_into_force` column (per [[rule-cross-reference-integrity]])
- Section 8 subsections that don't appear in the regulation (the writer does not invent obligations the regulation does not impose)

## Composition

Composes with:
- [[writer-yaml-emission]] for the 13-field metadata block appended at the end
- [[writer-frame-regulations]] when this brief is rendered on /regulations surface (the frame layer extracts the regulatory frame from this brief)
- [[writer-frame-market]] when the brief renders on /market under market-signal framing (e.g., regulation with material competitive implications)
- [[writer-frame-research]] when academic analysis of the regulation surfaces it on /research
- [[writer-frame-operations]] when the regulation has per-region cost implications surfaced on /operations
- [[writer-summary-card-surface]] for card-text composition that reads from this brief

## Audit cross-reference

- Original source skill lines 182-303 (the 14-section spec)
- v2 audit Section 6.5 (structured fact extraction supersedes prose-only date emission)
- v2 audit Section 6.9 (per-surface framing reads from this canonical brief)
- v2 audit Section 3 / S2 (75% of /regulations items are not regulations; [[classifier-page-routing]] keeps non-regulations off this writer)
