---
name: writer-technology-profile
description: Generates the 8-section technology profile for item_type IN (technology, innovation, tool). Multi-lens intelligence covering deployment activity, industry trajectory, supplier access, operational fit, competitive positioning, talking points, and time-to-market action. Emits markdown body for intelligence_items.full_brief plus the 13-field YAML metadata block via writer-yaml-emission.
---

# Writer: Technology Profile

## Purpose

Generates `full_brief` for items typed as technology, innovation, or tool. Structure preserved from original `environmental-policy-and-innovation` skill lines 307-345 (archived).

The reader question this writer answers: **what is happening in this technology space, who is doing what, what does it tell me about the industry's trajectory, what is the workspace's position relative to the industry, and what should the workspace do?**

## When to use

When `item_type IN (technology, innovation, tool)` and the item is being regenerated.

## When NOT to use

- When the item is a vendor SaaS that should never have been classified as technology in the first place — refer to [[classifier-item-type]] AND apply the source-vs-resource gate per [[rule-source-vs-resource-distinction]] BEFORE invoking this writer. A SaaS product page is a resource, not a source; it does not produce a technology profile.
- When the item is a regulation that mandates a technology (e.g., SAF mandate) — that goes to [[writer-regulatory-fact-document]]; the technology may have an adjacent profile but the regulation is the primary brief

## Inputs

- `intelligence_items` row + sources join + AVAILABLE SOURCES pool + workspace profile (verticals, modes, lanes, supply chain role)
- Per [[rule-synthesis-from-primary-sources]]: actively seek named-operator deployment data; do not settle for vendor self-promotion

## Outputs

- Markdown body for `intelligence_items.full_brief`
- 13-field YAML metadata block via [[writer-yaml-emission]]

## The 8 sections

### Section 1: What's Being Tested or Deployed and By Whom

SPECIFIC operator-level activity. Named operators (drawn from sourced reporting only), their specific deployment scope, the results to date. NOT "the industry is moving toward..." but "Operator A has X vessels in service with Y emissions reduction over baseline; Operator B has piloted Z routes for N months with reported uptime of P percent."

If the technology is research-stage with no operator deployments, name the research institutions and labs publicly working on it. If neither operator deployments nor research are sourced, the section is omitted with the explanatory note.

Per [[rule-no-speculation-as-fact]]: no invented operators, no invented pilot programs. Operator-level activity comes from sourced reporting only.

### Section 2: What This Tells Us About Industry Trajectory

The pattern of deployments and results. What it signals about where the industry is going.
- Is this a one-operator experiment or a multi-operator competitive race?
- What is driving it: regulation, client demand, operator strategy, supplier push, capital availability?
- When does this go from "early movers experimenting" to "table stakes for major contracts"?

Sourced inferences only. Speculation is not allowed; pattern recognition over sourced data points is.

### Section 3: Supplier Access and Procurement Reality

Who can buy this technology today and at what scale.
- Whether the supplier has exclusive arrangements with named operators
- Multi-operator agreements
- Open commercial availability
- Lead times
- Financing structures
- Pilot program access

Sourced from supplier announcements, operator press releases, industry reporting.

Per [[rule-source-vs-resource-distinction]]: when the supplier IS a vendor with its own sales motion, the writer extracts the verifiable supply facts (deployments, contracts, scale) without becoming an endorsement. The vendor's marketing claims are not the source; the operator press releases and industry reporting that verify them are.

### Section 4: Operational Fit by Transport Mode and Cargo Vertical

Which freight operations this applies to today, which it will not apply to ever, which are conditional on further development. Air, road, ocean in the workspace's transport-mode priority order, with vertical-specific notes drawn from the workspace's cargo vertical profile.

Per [[rule-cause-and-effect-chain]]: each mode/vertical line carries the chain. Per [[rule-workspace-anchored-output]]: vertical references come from the workspace profile, generic framing.

### Section 5: Competitive Positioning Implications for the Workspace

- What contracts are at risk if competitors have this and the workspace does not
- What contracts the workspace could win if it gains access first
- Specific bidding scenarios where the technology is named in tender requirements or RFP language
- Named competitors and their access status, sourced

### Section 6: Conversational and Strategic Talking Points

- What the workspace can credibly say to clients about this technology
- What questions the workspace can pose to clients to demonstrate sophistication
- What pitfalls to avoid (overclaiming on technology not yet deployed at scale, citing studies the workspace has not read)

### Section 7: Time-to-Market, Procurement Window, and Action

- When this technology becomes commercially available at scale
- When the workspace would need to commit to procurement, pilots, or partnerships to be in time for upcoming contract cycles
- Specific actions: conversations to start with which suppliers, financing models to evaluate, pilot programs to participate in, contract clauses to add, talking points to develop, internal teams to brief

Per [[rule-fsi-brief-framework]]: action-first language. Per [[vocabulary-severity-labels]]: COMPETITIVE EDGE for first-mover positioning; COST ALERT for procurement cost changes; ACTION REQUIRED for 30-day commit deadlines.

### Section 8: Sources

Source list with type labels per [[rule-source-tier-hierarchy]].

## Inherits

- [[rule-no-speculation-as-fact]]
- [[rule-no-regulatory-inferences-as-fact]] (when the technology touches regulatory mandates)
- [[rule-source-traceability-per-claim]]
- [[rule-cross-reference-integrity]]
- [[rule-workspace-anchored-output]]
- [[rule-fsi-brief-framework]]
- [[rule-source-tier-hierarchy]]
- [[rule-character-normalization]]
- [[rule-synthesis-from-primary-sources]] (active deployment-fact synthesis, not vendor-content summarization)
- [[rule-cause-and-effect-chain]] (Section 4 mode/vertical chains)
- [[rule-source-vs-resource-distinction]] (technology profiles ARE sources of intelligence about deployments; vendor self-promotion is NOT)
- [[vocabulary-severity-labels]]
- [[vocabulary-topic-tags]]
- [[vocabulary-compliance-objects]]
- [[vocabulary-transport-modes]]
- [[vocabulary-verticals]]
- [[reference-operational-scenarios]]

## Failure modes to avoid

- "The industry is moving toward X" without named operators
- Section 3 procurement reality sourced only from vendor marketing
- Section 5 competitive positioning that names competitors without sourced positioning data
- Section 7 actions that are generic "monitor developments" instead of specific procurement/pilot/clause/team-briefing moves

## Composition

Composes with [[writer-yaml-emission]] for the metadata block. Composes with [[writer-frame-market]] when rendered on /market surface and [[writer-frame-research]] when rendered on /research as an emerging-tech signal.

## Audit cross-reference

- Original source skill lines 307-345
- v2 audit Section 6.9 (per-surface framing)
- Migration 074 (EcoVadis reclassification — example of when "technology" classification was wrong because the item was a vendor service)
