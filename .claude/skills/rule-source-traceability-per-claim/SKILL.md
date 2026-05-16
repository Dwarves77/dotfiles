---
name: rule-source-traceability-per-claim
description: Integrity non-negotiable. Every claim on the card surface (summary, what_is_it, why_matters) carries inline attribution. Per-claim citations cannot live only in `full_brief` while the card surface strips them. The card layer respects the integrity contract the operator reads first.
---

# Rule: Source traceability at every claim level (card surface)

## Source

Operator brief 2026-05-15: "Source traceability at every claim level. Every fact traces to a source visible to the operator. Aggregations and summaries preserve source attribution."

## What this means

Every fact on every operator-facing surface (card summary, hero text, tile content) traces back to a source the operator can see. "Source visible to the operator" means in the visible body of the surface, not buried in:
- A tab the operator may never click
- A `full_brief` markdown field that the dashboard does not render
- A tooltip that only appears on hover
- A separate sources tab that requires extra navigation

When a single summary contains multiple claims (multi-claim card), each claim has its own attribution. A single source citation at the bottom of a summary covering five distinct facts does not satisfy this rule.

## The audit-measured failure rate

The audit found **100% of multi-claim card summaries lack per-claim attribution**. Even in the 25% of rows regenerated under the B.2 contract — where the underlying `full_brief` carries Article references and Annex citations — the card surface strips them.

This is the gap the brief calls out: "the card-versus-brief layer-stratification that the audit found is removed. The operator reads the same integrity contract on the surface they actually scan."

## Required citation patterns at the card layer

For a single-claim card (one fact), inline attribution at the end of the sentence:
> "EU MRV expanded scope from 2025, single source of truth for maritime carbon compliance *(Source: EU MRV Regulation, EMSA, in force as of 2025)*."

For a multi-claim card, attribution per claim:
> "EU SAF mandate starts 2% in 2025 *(ReFuelEU Aviation Article 4)*, escalating to 10% by 2030 and 22% by 2040 *(same)*. UK SAF Mandate parallels EU but applies UK suppliers only *(UK SAF Mandate Order 2024)*."

For a claim inherited from a related item, the related item's title is the citation:
> "Cross-references EU ETS for shipping (linked) on emissions-reporting-Scope3 *(see EU ETS for Maritime, in force from 2024)*."

## Surface specificity

This rule applies to:
- `intelligence_items.summary` (the dashboard card body)
- `intelligence_items.what_is_it` (the operator-authored or seed-script content the detail page renders prominently)
- `intelligence_items.why_matters` (the operator-relevance text)
- The first 200 characters of `intelligence_items.full_brief` if rendered as a hero excerpt
- Any other field that is rendered to the operator without a "click to see brief" indirection

This rule does NOT require attribution inside the body of `full_brief` markdown that already has its own attribution discipline (per [[writer-regulatory-fact-document]] etc.). The writers for `full_brief` carry their own per-section sourcing rules.

## Behavior when source is missing

If a writer cannot trace a claim on the card surface to a source it has access to:
1. The claim is omitted from the card surface, even if it appears in the brief
2. Substitute with a more general but sourced statement
3. Or link to the brief: "See full brief for sourced detail"

Never emit an unsourced claim on the card layer to fill space.

## Composition

This rule is part of [the four integrity non-negotiables](../INDEX.md#rules-7--composable-contracts-every-writerclassifier-inherits). Closely paired with [[rule-no-speculation-as-fact]] (which addresses inventing specificity) and [[rule-source-tier-hierarchy]] (which addresses how to weight sources when they conflict).

Every writer inherits this rule, particularly:
- [[writer-summary-card-surface]] — the card-text writer this rule was designed to constrain
- [[writer-regulatory-fact-document]] — must surface its inline citations to the card layer when applicable
- [[writer-yaml-emission]] — `sources_used` array must be populated for every multi-source brief

## Audit cross-reference

- v2 audit Section 3 / S15 (integrity non-negotiables violated at card surface, not in brief)
- v2 audit Section 6.5 (span provenance pattern from major intelligence platforms)
- v2 audit Section 6.10 (per-claim provenance click-through as operator-facing affordance)
- Audit area 6 finding: 100% of multi-claim card summaries lack per-claim attribution
