---
name: classifier-page-routing
description: STUB. Composes the 5 axis classifiers into the page-routing decision (which of /regulations, /research, /market, /operations the item primarily belongs on). Itself auditable — the routing rationale is stored. Closes audit S2 (item_type+domain page filters that produce 75% miscategorization on /regulations).
---

# Classifier: Page Routing

## Purpose

Decides which of the four pages an item primarily belongs on. Today's routing is page-side OR expressions over `item_type` and `domain` with a default-to-1 adapter that sweeps 75% of items into /regulations regardless of their type. This classifier replaces those page-side filters with deterministic rules grounded in source_role + item_type, with rationale stored for audit.

## When to use

- New item ingestion (after all per-axis classifiers complete)
- Item reclassification (when source_role or item_type changes)

## Inputs

- All per-axis classifications: source_role, item_type, jurisdictions, modes, verticals, severity, status
- Per-surface frame implications (an item can be PRIMARY on one page and ALSO render on others under different frames per [[writer-frame-regulations]] etc.)

## Outputs

- `intelligence_items.primary_surface` (TO ADD as schema column: one of /regulations, /research, /market, /operations)
- `intelligence_items.secondary_surfaces[]` (TO ADD: array of other surfaces this item should appear on under per-surface frames)
- `routing_rationale` (TO ADD: text explaining the decision)

## Per-page tier acceptance (CRITICAL)

Per operator clarification 2026-05-15: each page has an internal-tier acceptance range. Items outside the page's tier range are routed away even if their item_type would otherwise place them there.

| Page | Internal tier acceptance | Notes |
|---|---|---|
| /regulations | T1-T5 ONLY | Regulatory items must be authoritative. T6-T7 with regulatory implications route to /market. |
| /market | T1-T7 | All tiers acceptable with plain-language confidence labeling at the card per [[rule-internal-vs-external-surface]]. Competitive lead time depends on catching T6-T7 signals before they're confirmed. |
| /research | T1-T7 | Academic findings (T3) and think-tank analysis (T6) common; tier translated to plain-language confidence label. |
| /operations | T1-T5 for facts; T6-T7 for emerging practice | Cost baseline and feasibility figures need T1-T5; emerging-practice reports (e.g., trade press describing how a specific operator approached a regional compliance challenge) can be T6-T7 with confidence labeling. |

## Change-driven vs static gate

Per [[rule-source-vs-resource-distinction]] and the change-driven vs static distinction:

- **CHANGE-DRIVEN content** is intelligence; route to one of the four pages per item_type + tier acceptance
- **STATIC content** (publisher's existence, methodology, calculator, service description) is NOT intelligence; route to resource catalog or community vendor directory, NOT to any of the four intelligence pages

This gate runs before the page-routing decision: if the content is static (a vendor's "About Us" page; a publisher's methodology description without a change announcement), the item does not reach this classifier — it gets routed away at [[classifier-source-onboarding]]. If the content is change-driven (a vendor's NEW product launch; a regulator's amendment; a research finding's publication), it reaches this classifier and is routed per the rules below.

## Routing rules (extracted from PR #100 design + extended per Section 6.9 + per-page tier filter)

```
First gate: change-driven check (per rule-source-vs-resource-distinction)
  If content is STATIC → route to resource-taxonomy review; do not classify here

Second gate: per-page tier acceptance (see table above)
  If item's internal tier exceeds page tolerance → route to the appropriate alternate page

PRIMARY surface = /regulations IF:
  internal_tier IN (T1-T5) AND
  ( source_role = primary_legal_authority AND item_type IN (regulation, directive, standard)
    OR item_type IN (regulation, directive) AND status IN (in_force, adopted) )

PRIMARY surface = /research IF:
  internal_tier IN (T1-T7) AND
  ( source_role IN (intergovernmental_body, academic_research, standards_body) AND status NOT IN (in_force, adopted)
    OR item_type = research_finding
    OR (source_role = primary_legal_authority AND status = proposed) )

PRIMARY surface = /market IF:
  internal_tier IN (T1-T7) AND
  ( source_role IN (trade_press, industry_data_provider, vendor_corporate, industry_association)
    AND item_type IN (market_signal, initiative, technology, innovation, tool) )
  OR
  ( internal_tier IN (T6-T7) AND change-driven content with regulatory or technology implications )

PRIMARY surface = /operations IF:
  source_role = statistical_data_agency AND internal_tier IN (T1-T5) for cost facts
  OR item_type = regional_data AND internal_tier IN (T1-T5)
  OR ( emerging-practice report AND internal_tier IN (T6-T7) )
```

SECONDARY surfaces (per-surface frames render the same item differently):
- A regulation that has competitive implications also appears on /market under [[writer-frame-market]]
- A regulation with academic research analyzing it also appears on /research under [[writer-frame-research]]
- A regulation with regional cost implications also appears on /operations under [[writer-frame-operations]]

When an item's primary surface is /regulations but its internal tier is T6-T7, its PRIMARY surface routes to /market (the regulatory content is still surfaced, framed as a market signal, with the plain-language confidence label indicating its unconfirmed status). Per [[rule-internal-vs-external-surface]]: the tier itself is never exposed; the plain-language label communicates the confidence.

## Inherits

- [[rule-cross-reference-integrity]] (routing decision is canonical, doesn't drift)
- [[rule-source-vs-resource-distinction]] (the change-driven vs static gate runs first)
- [[rule-internal-vs-external-surface]] (per-page tier acceptance uses INTERNAL tier numbers; the customer-visible page surfaces never expose them; the plain-language confidence label communicates instead)
- All vocabulary skills (source-tiers, severity-labels, etc.)
- [[reference-jurisdictions]]

## Composition

Reads from:
- [[classifier-source-onboarding]] (source_role)
- [[classifier-item-type]] (item_type)
- [[classifier-vertical-mode]] (verticals, modes)
- [[classifier-severity-priority]] (severity, priority)
- [[classifier-jurisdiction]] (jurisdictions)

Used by:
- The 4 [[writer-frame-*]] skills (which surfaces to render this item on)
- The page-data RPCs (which items to return for each page)

## Audit cross-reference

- v2 audit Section 3 / S2 (75% of /regulations items are not regulations)
- v2 audit Section 6.9 (per-surface framing as a derived view)
- PR #100 (Phase 1 routing design — this skill is the operational form of that design)
