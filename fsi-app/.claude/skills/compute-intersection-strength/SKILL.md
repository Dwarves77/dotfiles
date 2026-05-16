---
name: compute-intersection-strength
description: STUB. Strength score for an intersection pair. +3/scenario tag, +2/compliance object, +5 explicit linkage, +2 if both CRITICAL/HIGH. Strength tiers strong/medium/weak per archived SKILL.md.
---

# Compute: Intersection Strength

## Purpose

Computes the strength score for an intersection pair (per [[extractor-intersections]]). Drives display order on the Source Health Dashboard intersections sub-tab.

## Formula (from archived SKILL.md "Intersection Detection")

```
strength = (3 × shared_operational_scenario_tag_count)
         + (2 × shared_compliance_object_tag_count)
         + (5 IF A explicitly lists B in related_items OR B lists A)
         + (2 IF both A and B are priority CRITICAL or HIGH)
```

## Strength tiers

- Strong (≥12): obvious-once-shown couplings, surface first
- Medium (8-11): worth surfacing but require reader judgment
- Weak (<8): limited overlap; surface only when filters call for them

## Inputs

- Pair (A, B) with their tag arrays and priority

## Outputs

- `strength_score` (integer)
- `strength_tier` (strong / medium / weak)

## Inherits

- [[reference-operational-scenarios]]
- [[vocabulary-compliance-objects]]
- [[vocabulary-severity-labels]] (for the priority CRITICAL/HIGH check)

## Composition

Used by [[extractor-intersections]] to score every detected pair. Output consumed by Source Health Dashboard.

## Audit cross-reference

- Archived SKILL.md "Intersection Detection" section, "Strength scoring" subsection
- v2 audit Section 6.4 (knowledge graph layer)
