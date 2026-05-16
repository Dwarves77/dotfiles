---
name: reference-operational-scenarios
description: Open vocabulary core glossary (~36 values) for `intelligence_items.operational_scenario_tags`. Drives intersection detection (per [[extractor-intersections]]). Lower-case kebab-case. New values allowed when the core doesn't fit, but core glossary should be tried first to keep joining mechanical.
---

# Reference: operational-scenarios (open, ~36 core values)

## Source

Original `environmental-policy-and-innovation` skill, "Operational Scenario Tags" section.

## Why open vocabulary

Closed-vocabulary fields (topic_tags, compliance_object_tags) make joining mechanical but constrain expressiveness. Operational scenarios cover many specific freight-operational situations that change over time as regulations introduce new categories. This vocabulary is open to allow growth, but the core glossary is the strongly preferred starting point.

## Core glossary (~36 values, prefer these)

### Ocean (7)
- `ocean-bunkering`
- `ocean-fuel-blend-mandate`
- `ocean-emissions-MRV`
- `vessel-port-call`
- `vessel-shore-power`
- `vessel-CII-rating`
- `green-shipping-corridor`

### Air (5)
- `air-fueling`
- `SAF-blending`
- `aircraft-emissions-CORSIA`
- `aircraft-emissions-ETS`
- `airport-shore-power`

### Road (5)
- `road-cabotage`
- `drayage`
- `urban-truck-zone`
- `truck-CO2-standard`
- `road-charging-infrastructure`

### Customs/trade (5)
- `customs-declaration-import`
- `customs-declaration-export`
- `CBAM-declaration`
- `EUDR-due-diligence`
- `dangerous-goods-classification`

### Carbon/ETS (4)
- `ETS-allowance-purchase`
- `ETS-allowance-surrender`
- `carbon-pricing-pass-through`
- `carbon-border-adjustment`

### Reporting (5)
- `emissions-reporting-Scope1`
- `emissions-reporting-Scope3`
- `sustainability-report-CSRD`
- `disclosure-ISSB`
- `supplier-data-request`

### Packaging/products (4)
- `packaging-EPR-registration`
- `packaging-recyclability-design`
- `packaging-PFAS-restriction`
- `product-due-diligence-CSDDD`

## Rules

1. **Lower-case kebab-case.** No spaces, no underscores, no camelCase.
2. **0-5 tags per item.** An item without a clear operational scenario (e.g., background research) may emit `[]`. Honest is correct.
3. **Prefer core glossary.** New values allowed when the core doesn't fit and the substance is clearly operational (not generic). Two items emitting `vessel-CII-rating` join cleanly. Two items where one emits `vessel-CII-rating` and the other emits `cii-rating-vessels` (paraphrase) never join. The vocabulary's job is to make joining mechanical.
4. **Tag what the brief covers.** EU CBAM is named after carbon border adjustment but its substantive content also covers customs declaration import and Scope 3 reporting. Tag the full set: `CBAM-declaration`, `customs-declaration-import`, `emissions-reporting-Scope3`, `carbon-border-adjustment`.

## When to introduce a new scenario tag

Conditions:
- The core glossary has no value that fits the substance
- The substance is clearly operational (a specific freight situation imposing a specific obligation), not generic
- The new tag follows the kebab-case convention
- The new tag is named for an actual operational situation, not for a regulation (regulations are item entities; scenarios are situation tags)

When introduced, document the new value in this skill file's changelog so future writers know it exists.

## Composition

Used by:
- [[writer-yaml-emission]] — emits operational_scenario_tags in metadata
- [[extractor-intersections]] — operational_scenario_tag overlap is a hard requirement for intersection detection
- [[compute-intersection-strength]] — +3 points per shared operational_scenario_tag

Related:
- [[vocabulary-compliance-objects]] — closed vocabulary, the orthogonal axis for intersection detection
- [[vocabulary-topic-tags]] — closed vocabulary, the higher-level filter axis (different purpose)

## Audit cross-reference

- v2 audit Section 6.4 (knowledge graph layer; intersections are graph queries)
- Original SKILL.md "Intersection Detection" section
