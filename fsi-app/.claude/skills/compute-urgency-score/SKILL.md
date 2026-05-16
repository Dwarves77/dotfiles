---
name: compute-urgency-score
description: STUB. Composite urgency formula combining impact dimensions, priority, time, jurisdiction, and (per Section 6.7) lead-time. Determines item ranking on every page. Extracted from archived skill "Urgency Scoring" section.
---

# Compute: Urgency Score

## Purpose

Computes the composite urgency score that ranks items on every page. Formula combines impact axes, priority weight, time-to-deadline weight, jurisdiction weight, and (Section 6.7 extension) lead-time value.

## Current formula (archived SKILL.md)

```
urgency_score = (sum of impact across 4 dimensions)
              × priority_weight
              × time_weight
              × jurisdiction_weight
```

Where:
- Impact dimensions (each 0-3): Cost, Compliance, Client, Operational
- Priority weights: CRITICAL=4, HIGH=3, MODERATE=2, LOW=1
- Time weight: 365 / (days to next future milestone), capped at 5
- Jurisdiction weights: EU=3, US=2, UK=2, Global=3, Asia=1, LatAm=1, divided by 3, applied as 0.5 + (jurW × 0.5)

## Section 6.7 extension: lead-time multiplier

Per the brief's "earlier surfacing compounds value" thesis, add:
```
× lead_time_multiplier
```

Where:
- Items surfaced > 6 months before effective date: ×1.5 (high lead-time value)
- 3-6 months: ×1.2
- 1-3 months: ×1.0 (baseline)
- < 1 month: ×0.8 (less actionable lead time)
- After effective date (reactive): ×0.5

This makes lead-time a first-class ranking signal.

## Inputs

- All four impact scores
- `priority` (per [[classifier-severity-priority]])
- `entry_into_force` or next milestone date
- Primary jurisdiction (per [[classifier-jurisdiction]])
- Lead time (per [[compute-lead-time]])

## Outputs

- `urgency_score` (numeric)

## Inherits

- [[vocabulary-severity-labels]] (priority weights)
- [[reference-jurisdictions]] (jurisdiction weights)

## Composition

Reads from all classifiers and [[compute-lead-time]]. Output consumed by:
- /regulations sort order
- /market PolicySignals strip ordering
- Dashboard top-priority surface

## Audit cross-reference

- Archived SKILL.md "Urgency Scoring" section
- v2 audit Section 6.7 (lead time as first-class column)
