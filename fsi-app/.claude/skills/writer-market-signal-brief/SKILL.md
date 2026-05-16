---
name: writer-market-signal-brief
description: Generates the 8-section market signal brief for item_type IN (market_signal, initiative). What's moving, who's driving, expected trajectory, operational implications if it materializes, competitive implications, talking points, positioning actions. Emits markdown body for intelligence_items.full_brief plus the 13-field YAML metadata block via writer-yaml-emission.
---

# Writer: Market Signal Brief

## Purpose

Generates `full_brief` for market signals and voluntary initiatives. Structure preserved from original `environmental-policy-and-innovation` skill lines 391-427 (archived).

The reader question this writer answers: **what is moving in the industry that could give me or my competitors an edge, and what should I do while it is still a signal?**

## When to use

When `item_type IN (market_signal, initiative)` and the item is being regenerated.

This format also fits per [[rule-source-vs-resource-distinction]] for client-demand signals that name resources: "Brand X requires EcoVadis Gold by Q1 2027" is a market_signal_brief; the source is Brand X's announcement; EcoVadis appears in the brief as the resource the demand references (NOT as a source).

This format also fits change-driven publisher events: a vendor's NEW PRODUCT LAUNCH, methodology update, acquisition, service withdrawal, or position shift is a market signal at the appropriate tier even though the vendor's mere existence would be a resource catalog entry. Example: "ROKBOX launches new product line addressing CITES paperwork reduction" is /market T6; "ROKBOX exists" is community vendor directory.

## When NOT to use

When the item is a real regulation (item_type=regulation) — that goes to [[writer-regulatory-fact-document]] even if it triggers market activity. The brief generated here is for the SIGNAL, not the underlying regulation.

When the item is vendor self-promotion of its mere existence (per [[rule-source-vs-resource-distinction]]) — that gets rejected at [[classifier-source-onboarding]] before reaching this writer.

## Inputs

- `intelligence_items` row + sources join + AVAILABLE SOURCES pool
- Workspace profile (verticals, modes, lanes, supply chain role)
- Competitor identity (when sourced)
- Source tier (drives the tier label that appears at the card surface; /market accepts T1-T7 with labeling)

## Outputs

- Markdown body for `intelligence_items.full_brief`
- 13-field YAML metadata block via [[writer-yaml-emission]]

## The 8 sections

### Section 1: What's Moving and What Triggered It

Specific signal or initiative described. Parties involved. Trigger event. Sourced.

If the trigger is a CHANGE-DRIVEN publisher event (a methodology update from a trade association, a new product launch from a vendor, an acquisition, a service withdrawal, a position shift), name the change explicitly and identify the publisher with its source tier per [[vocabulary-source-tiers]].

### Section 2: Who's Driving It and What They Want

Named parties (companies, regulators, coalitions, industry bodies). Their stated interests. Their leverage. Their likely strategy. Sourced inferences only.

### Section 3: Expected Trajectory and Conversion Triggers

Probable next steps. What would convert this from signal to active rule or active commercial pressure. Likely timeline, sourced.

Per [[rule-synthesis-from-primary-sources]]: this is where active synthesis matters. The conversion-triggers framing identifies what would move the signal forward; the writer's job is to surface the plausible triggers grounded in scheduling sources, not invent them.

### Section 4: Operational and Cost Implications If It Materializes

Concrete cost and operational consequences for the workspace if this signal becomes reality. Filtered by transport mode and cargo vertical, drawn from the workspace profile.

Per [[rule-cause-and-effect-chain]]: each consequence carries cause (the signal materializing) + mechanical consequence (the operational change) + effect-by-vertical (which workspace verticals see which impact).

### Section 5: Competitive Implications

Which competitors are positioned to benefit from this. Which competitors would be hurt. Where the workspace sits relative to both. Named competitors, sourced.

### Section 6: Client Conversation Talking Points

How to discuss this signal with clients. What the workspace's public posture should be while it is still a signal. What questions to pose. What claims to avoid.

### Section 7: What the Workspace Should Do Now

POSITIONING actions, not compliance actions. The signal hasn't materialized yet; the workspace is positioning, not complying.
- Vendor conversations to start
- Contract clauses to consider for upcoming renewals
- Data tracking to enable now so the workspace has baseline when the signal materializes
- Coalition or working-group participation
- Talking-point development
- Specific committee or coalition participation

Per [[rule-fsi-brief-framework]]: action-first language. Per [[vocabulary-severity-labels]]: COMPETITIVE EDGE for first-mover positioning is the typical assignment.

### Section 8: Sources

Source list with type labels per [[rule-source-tier-hierarchy]]. Per the per-page tier acceptance rule for /market: T1-T7 are acceptable with explicit tier labeling at the card surface; this section reinforces tier-by-source.

## Tier labeling at the card surface (CRITICAL)

Per operator clarification 2026-05-15: /market accepts T1-T7 with tier labeled on the card. The reader must be able to weight each item correctly. This writer's output is consumed by [[writer-summary-card-surface]] which is responsible for the tier-label display, but THIS writer ensures the source tier is identifiable in Section 8 (and inline) so the card surface can read it.

If the source is T6-T7 (trade press, vendor-corporate change announcement, analyst opinion), the card surface MUST display the tier so the reader knows it's not authoritative. Without that labeling, an analyst opinion can be misread as binding regulation.

## Inherits

- [[rule-no-speculation-as-fact]]
- [[rule-source-traceability-per-claim]]
- [[rule-cross-reference-integrity]]
- [[rule-workspace-anchored-output]]
- [[rule-fsi-brief-framework]]
- [[rule-source-tier-hierarchy]]
- [[rule-character-normalization]]
- [[rule-synthesis-from-primary-sources]]
- [[rule-cause-and-effect-chain]]
- [[rule-source-vs-resource-distinction]] (client-demand signals + change-driven publisher events distinguished from static catalog entries)
- [[vocabulary-severity-labels]] (COMPETITIVE EDGE / COST ALERT / MONITORING)
- [[vocabulary-topic-tags]]
- [[vocabulary-compliance-objects]]
- [[vocabulary-source-tiers]] (tier labeling at card surface for T6-T7)
- [[reference-operational-scenarios]]

## Failure modes to avoid

- T6-T7 content rendered on the card surface without tier labeling (the reader cannot weight the claim)
- A vendor's NEW product launch presented as if it were regulator-mandated (per [[rule-source-vs-resource-distinction]]: the launch IS a market signal, but its tier reflects the vendor's tier T5/T6, not T1-T2)
- Section 7 actions that are compliance actions (this format is for signal-stage positioning; compliance goes to [[writer-regulatory-fact-document]])
- Competitor naming without sourced positioning data

## Composition

Composes with [[writer-yaml-emission]] for the metadata block. Composes with [[writer-frame-market]] when rendered on /market surface. May also compose with [[writer-frame-regulations]] if the signal converts to a regulation (rare during signal phase; once the signal materializes the item_type changes and [[writer-regulatory-fact-document]] takes over).

## Audit cross-reference

- Original source skill lines 391-427
- v2 audit Section 2 (Market Intel page) + S4 (source classification not surfaced at card)
- Operator clarification 2026-05-15 (per-page tier acceptance, change-driven vs static distinction)
