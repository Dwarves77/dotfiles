## Output Formats

The skill produces four format families plus the regulatory fact document. Each item type maps to one format. The agent selects the format based on intelligence_items.item_type at generation time.

### Format Mapping

- regulation, directive, standard, guidance, framework: Regulatory Fact Document (15 sections, conditional)
- technology, innovation, tool: Technology Profile (8 sections)
- regional_data: Operations Profile (8 sections)
- market_signal, initiative: Market Signal Brief (8 sections)
- research_finding: Research Summary (6 sections)

Section counts above are maximums. Sections without grounded content are omitted with an explanatory note, never filled with speculation.

### Canonical instrument key (dedup-before-grounding identity)

Every reg-family item derived from an EU legal instrument carries a CANONICAL INSTRUMENT KEY — the bare CELEX number (e.g. `32019R1242`), derived from its `instrument_identifier` or `source_url` (a full CELEX token, or an ELI `eli/{reg|dir|dec}/YYYY/N/oj` path), left NULL when not confidently derivable (a bare `YYYY/N` alone is ambiguous between regulation and directive and is never guessed). Two VERIFIED, non-archived items MUST NOT share a canonical instrument key — that is two live customer-visible copies of one regulation (the PPWR-both-verified twin defect), and the key is the join the "dedup before grounding — entity identity, not title" gate needs. Enforced by the normalizing trigger + partial unique index (migration 200) and the `canonical-key-uniqueness` lane audit (invariant EP-11).

---

## Regulatory Fact Document (15 sections, conditional)

For: regulation, directive, standard, guidance, framework

This format has 15 numbered sections: 14 content sections (1–14) plus Section 15 Sources. It was historically labeled "14-section" when Sources was treated as an appendix rather than a numbered section; the canonical count is 15. Most sections are conditional — a brief renders only the sections it can honestly ground, and the integrity rule means a partial brief is correct, not deficient.

The reader question: what does this regulation require, where does the workspace sit in the compliance chain, what is decided versus what is unresolved, and what does the workspace do now?

### Section 1: Purpose and Scope of This Document

What this document covers (the regulation, its identifier, its jurisdiction). Convention notes (which items require legal confirmation, which items are industry operator interpretation versus legal authority, which items are sourced from authoritative guidance). Date of document. Date of regulation publication. Date of next scheduled review.

### Section 2: What This Regulation Is and Why It Applies to the Workspace

The regulation in plain language: who issued it, what it requires, when it takes effect. Why it matters to the workspace's operations: which cargo verticals are affected, which transport modes are affected, which trade lanes are affected, which supply chain roles the workspace occupies that are in scope.

### Section 3: Issues Requiring Immediate Action

What the workspace must decide or do now or within 30 days. Specific actions, not "be aware of." Each action labeled with severity (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING). Each action leads with a CONCRETE action verb (Assess, Map, Verify, Commission, Engage, Negotiate, Reconcile), then cost or consequence, then deadline.

Labeling discipline in this and every workspace-ACTION section (also Operational System Requirements, What the Workspace Should Do Now, any "Status:" / readiness line): the analytical judgement that justifies the action — the workspace's EXPOSURE, readiness, interoperability, or the CONSEQUENCE of a gap ("results may not satisfy ISO 14083 scrutiny", "compliance depends on receiving carrier-level activity data") — is ANALYSIS and MUST open with a recognized label (`*Operational implication:*` or `*Analytical inference:*`), cited where a source exists. This is the section's value: KEEP the judgement, LABEL it — never drop, hedge, or soften it to pass the gate. And NEVER lead an action with a bare regulatory modal ("Requires internal assessment", "Must assess", "Status: Requires …"): the provenance gate (criterion 4) reads the bare `requires/must/applies to` in a section with no grounded FACT and no recognized label as an unlabeled assertion and quarantines the brief, regardless that you meant it as an action, not a legal obligation. This is the moat working — analysis must be labeled as analysis, never bare-asserted.

### Section 4: How the Workspace Sits in the Compliance Chain

The supply chain roles the regulation defines (manufacturer, importer, distributor, fulfillment provider, etc.) and the role the workspace occupies in each transaction type. Different transactions may place the workspace in different roles. Each role carries distinct obligations. This section maps the workspace's role profile against the regulation's role taxonomy and identifies where legal must confirm role placement.

### Section 5: Authoritative Guidance Document Analysis (conditional)

When authoritative guidance exists (e.g., Commission implementing acts, regulator FAQs, agency interpretive bulletins), this section synthesizes the guidance section by section. Each provision quoted or paraphrased with citation. Each provision interpreted against the workspace's role and operations. Items requiring legal confirmation are labeled.

When authoritative guidance does not yet exist, this section is omitted with a note: "No authoritative guidance published as of [date]." If guidance is anticipated, the next section addresses it.

### Section 6: Anticipated Authoritative Guidance and Pending Regulatory Events (conditional)

Forward-looking events that will or may change the analysis in this document. Each event includes:

- Event type (Commission implementing act, regulator guidance, court decision, technical working group report, consultation close, comitology committee, parliamentary review)
- Issuing body
- Expected date or window (sourced)
- What the event is expected to address
- What sections of this document are likely to update when the event materializes
- What the workspace should expect to need to decide or change in response

When the event materializes, the system flags the document for update. The agent regenerates the affected sections, integrates the new content, and the event is marked addressed.

If no anticipated events are sourced, the section is omitted.

### Section 7: Threshold Questions (conditional)

When the regulation requires interpretation of a threshold question that determines whether and how it applies (e.g., "what qualifies as packaging," "who is the manufacturer in this supply chain," "what counts as a covered emission"), this section presents:

- The threshold question, plain language
- The regulatory text that defines it
- The authoritative guidance that interprets it (if any)
- The application to the workspace's specific situation
- What is decided versus what requires legal confirmation

If no threshold questions exist, the section is omitted.

### Section 8: Substantive Requirements

The regulation's specific obligations applied to the workspace's operations. Subsections vary by regulation: reuse targets, recyclability, labeling, registration, reporting, declarations of conformity, technical documentation retention, etc. Each subsection identifies the obligation, the deadline, the workspace's compliance status as of the document date, and the action required.

**Qualification capture (mandatory).** The pipeline feeds the FULL enacted text; read all of it, not the opening. For every requirement, capture its qualifications — not just the headline value: exceptions and carve-outs ("except …", "shall not apply to …"); the calculation basis stated as written (e.g. "calculated as an average per manufacturing plant and year" is per-plant-per-year, NOT per-unit); the defined terms it turns on, quoted from the regulation's own definitions article verbatim (never a loose synonym); and the per-year trajectory (a 2030 floor, a 2035 added requirement, a 2038 restriction or ban — the whole series, not the entry-year value; an "or N years from the implementing act, whichever is later" trigger is part of the requirement). A requirement stated with zero qualifications is a flag to re-read the source. Matching the workspace to a defined role, or deciding that an obligation attaches, is a legal determination — route it to "Legal Confirmation Required," never assert it.

This section adapts to the regulation. A regulation imposing reuse targets has a Reuse Requirements subsection. A regulation imposing labeling has a Labeling Requirements subsection. The agent does not invent subsections that the regulation does not impose.

### Section 9: Product-Specific Compliance Status (conditional)

When the workspace sells specific products under its own name and those products fall within the regulation's scope, this section addresses each product:

- Product description, anonymized
- Material classification under the regulation
- Article-specific obligations that apply
- Current compliance status
- Outstanding questions requiring legal review

If the workspace sells no products within scope, the section is omitted.

### Section 10: Registration and Reporting Obligations

EPR registration, producer registration, jurisdictional reporting requirements that the regulation imposes. For each, the deadline, the format (where published), the data the workspace must collect, and the registration scope (per Member State, per jurisdiction, etc.).

When registration formats have been promised but not yet published, this section notes the gap and identifies what monitoring is required.

### Section 11: Operational System Requirements

What the regulation requires the workspace to build or modify operationally. Tracking systems, reporting infrastructure, training programs, supplier onboarding processes, contractual modifications. Each requirement includes scope, deadline, and the gap between current operational baseline and what the regulation requires.

### Section 12: Exemptions and Edge Cases (conditional)

When the regulation provides exemptions, transition periods, or edge cases relevant to the workspace's operations, this section identifies each, the conditions for qualifying, and the documentation or evidence required to claim the exemption. If no exemptions apply or are sourced, the section is omitted.

### Section 13: Adjacent Industry Research and Alternatives (conditional)

When industry research, alternative approaches, or emerging compliance strategies are publicly documented, this section summarizes them. Examples: alternative materials being evaluated, alternative compliance pathways being piloted, industry coalitions developing harmonized approaches.

If no adjacent research is sourced, the section is omitted.

### Section 14: Confirmed Regulatory Timeline

Dated milestones with specific obligations. Each milestone:

- Date
- What the workspace must have done by that date
- What goes into effect on that date
- Source

Use bullet points or a table. Past milestones noted as "in force as of [date]." Future milestones noted with their conditional triggers if any.

### Section 15: Sources

Full source list with type labels:

- Binding law and regulation (primary text)
- Regulator guidance and interpretive bulletins
- Intergovernmental body positions
- Industry body interpretation (labeled as such)
- News reporting
- Analysis and opinion (labeled as such)

Each source: title, issuing body, date, URL.

### Conditional Section Application

Sections 5, 6, 7, 9, 12, 13 are conditional. They appear only when grounded content exists. Section 8 expands or contracts based on the regulation's substantive scope. Sections 1, 2, 3, 4, 10, 11, 14, 15 are always present.

A new regulation with no authoritative guidance, no anticipated events, no threshold questions in dispute, no workspace-specific products, no exemptions, and no adjacent research, would publish with 9 of the 15 sections (1, 2, 3, 4, 8, 10, 11, 14, 15). That is correct. The brief is honest about what is known.

---
