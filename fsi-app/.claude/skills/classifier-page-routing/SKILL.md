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

## Routing rules (extracted from PR #100 design + extended per Section 6.9)

```
PRIMARY surface = /regulations IF:
  source_role = primary_legal_authority AND item_type IN (regulation, directive, standard)
  OR item_type IN (regulation, directive) AND status IN (in_force, adopted)

PRIMARY surface = /research IF:
  source_role IN (intergovernmental_body, academic_research, standards_body) AND status NOT IN (in_force, adopted)
  OR item_type = research_finding
  OR (source_role = primary_legal_authority AND status = proposed)

PRIMARY surface = /market IF:
  source_role IN (trade_press, industry_data_provider, vendor_corporate, industry_association)
  AND item_type IN (market_signal, initiative, technology, innovation, tool)

PRIMARY surface = /operations IF:
  source_role = statistical_data_agency
  OR item_type = regional_data
```

SECONDARY surfaces (per-surface frames render the same item differently):
- A regulation that has competitive implications also appears on /market under [[writer-frame-market]]
- A regulation with academic research analyzing it also appears on /research under [[writer-frame-research]]
- A regulation with regional cost implications also appears on /operations under [[writer-frame-operations]]

## Inherits

- [[rule-cross-reference-integrity]] (routing decision is canonical, doesn't drift)
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
