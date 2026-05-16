---
name: classifier-severity-priority
description: STUB. Assigns severity from content; computes priority via the locked severity-to-priority mapping. Today's failure mode 209/614 violations is closed by enforcing the mapping at the DB level (CHECK constraint or trigger), not just at one writer's parse-time.
---

# Classifier: Severity and Priority

## Purpose

Assigns `intelligence_items.severity` from content (which decision-pressure label applies) and computes `priority` via the locked mapping. Currently the mapping is enforced only at the Sonnet agent parse-time; 3 other writer paths bypass it, producing 209/614 violations (66% agreement).

## When to use

- New item ingestion (after item_type per [[classifier-item-type]])
- Item reclassification when content changes
- Backfill of pre-B.2 items (the 162 rows that have never been regenerated since the locked mapping was introduced)

## Inputs

- Item content (full_brief if exists, else summary + title)
- Workspace profile (decision pressure varies by workspace verticals/modes — though the severity itself is content-driven, the salience may differ)

## Outputs

- `intelligence_items.severity` per [[vocabulary-severity-labels]]
- `intelligence_items.priority` (CRITICAL / HIGH / MODERATE / LOW) computed via locked mapping
- `intelligence_items.urgency_tier` (watch / elevated / stable / informational) — TO DEFINE: rule mapping for urgency_tier vs priority

## Severity assignment rules (TO REFINE)

| Content signal | Severity |
|---|---|
| Active compliance window with firm deadline within 30 days; specific operator action required | ACTION REQUIRED |
| New surcharge, fee, or price change announced or in force | COST ALERT |
| Comment period ending, grant window closing, transition phase ending | WINDOW CLOSING |
| Competitor move surfaced before public; capability available before peers adopt | COMPETITIVE EDGE |
| Forward-looking signal without immediate decision pressure | MONITORING |

## Locked severity-to-priority mapping (enforce at DB level)

```
ACTION REQUIRED → CRITICAL
COST ALERT → HIGH
WINDOW CLOSING → HIGH
COMPETITIVE EDGE → MODERATE
MONITORING → LOW
```

Per [[rule-cross-reference-integrity]], this mapping should be enforced by:
- A CHECK constraint or
- A trigger that re-derives priority from severity on every UPDATE

Closing the 209-violation gap.

## Inherits

- [[rule-cross-reference-integrity]]
- [[vocabulary-severity-labels]]

## Audit cross-reference

- v2 audit Section 3 / S6 (B.2 contract enforced on one path, bypassed by all others)
- 209/614 rows violate (66% agreement)
- v2 audit Section 6.5 (DB-level constraint to make violations impossible by construction)
