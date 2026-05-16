---
name: rule-cross-reference-integrity
description: Integrity non-negotiable. When the same fact appears in multiple stores (effective date in summary, timeline tab, compliance_deadline column), they must agree. Mismatches indicate pipeline failure. One canonical writer per fact; structured-extraction layer is source of truth.
---

# Rule: Cross-reference integrity

## Source

Operator brief 2026-05-15: "Cross-reference integrity. When the same fact appears in multiple places (an effective date in a summary, the timeline tab, and the compliance_deadline field), they must agree. Mismatches indicate pipeline failure."

## What this means

A fact is canonical. It lives in exactly one place at write time. Every other surface that displays the fact reads from the canonical store. Drift between stores is impossible by construction.

The rule applies to facts that have structured representation (dates, penalties, jurisdictions, modes, severities) plus narrative representation in writer prose. The structured store is canonical; the narrative reads from it.

## The audit-measured failure rate

The audit found 58.3% disagreement (7 of 12) when both writer-stated date in summary and structured `entry_into_force` exist:

```
[3f7e1aed] Japan GX League:
  struct entry_into_force = 2024-04-01
  writer text says       = "October 2023"

[3f45b2aa] EPA Clean Ports:
  struct entry_into_force = 2025-01-01
  writer text says       = "Announced in September 2024"

[007104ed] Singapore Maritime Decarbonisation Blueprint:
  struct entry_into_force = 2024-01-01
  writer text says       = "November 2023"
```

The reader cannot tell which date governs their planning. Some are announcement-vs-effective date disambiguation failures (legitimate but unstated). Others are silent drift between writer and structured store.

The audit also found 75% agreement (44 of 177 disagree) on `intelligence_items.jurisdictions` vs `jurisdiction_iso`, and 39% agreement on `sources.jurisdictions` vs `sources.jurisdiction_iso`. The reader's first-element-of-array pattern (`jurisdictions[0]`) renders one value on the list page while the detail page reads ISO and renders another.

## Required behavior at write time

For every fact that has a structured column:

1. The structured column is written first (by the structured-extraction pass per [[extractor-structured-facts]])
2. Any narrative reference to the same fact in `summary` / `what_is_it` / `why_matters` / `full_brief` reads from the structured column at write time, not from independent extraction
3. When announcement date and effective date both apply, both are stored in distinct columns (e.g., `announcement_date` vs `entry_into_force`); writer prose disambiguates explicitly: "Announced [announcement_date]; effective [entry_into_force]."
4. When the structured column is null, the narrative omits the fact, does not invent it from a different source

## Required behavior at read time

For every surface that renders a fact appearing in multiple stores:

1. The surface reads the canonical store (the structured column)
2. The surface does not parse the narrative for the fact when the structured column is available
3. When the surface needs disambiguation (announcement vs effective), it reads both structured columns and labels them explicitly

The list-page-vs-detail-page jurisdiction-label drift the audit identified is fixed by both surfaces reading `jurisdiction_iso` (canonical) and falling back to `jurisdictions[0]` only when ISO is null, with a visible "(legacy free-text label)" indicator when the fallback fires.

## One canonical writer per fact

Today the audit found three writers populating `summary` (Haiku classifier, manual seed scripts, legacy "Pre-tracking" placeholders). 209 of 614 rows violate the locked severity-to-priority mapping because three writer paths bypass the parse-time validation enforced only by the Sonnet agent path.

This rule requires: one writer per column. The writer that owns a column is the only writer that touches it. Other writer paths read from it. Schema-level enforcement (CHECK constraints, triggers) where possible.

## Composition

This rule is part of [the four integrity non-negotiables](../INDEX.md#rules-7--composable-contracts-every-writerclassifier-inherits).

Inherited by:
- [[writer-yaml-emission]] — emits structured columns from the brief; downstream must read them, not the brief
- [[extractor-structured-facts]] — writes the canonical store
- [[operational-versioning-and-changelog]] — when a fact changes, version log records the change in the canonical store; all surfaces re-render against the new value

## Audit cross-reference

- v2 audit Section 3 / S6 (B.2 contract enforced on one writer path, bypassed by all others — 209 violations)
- v2 audit Section 3 / S7 (three vocabularies for source classification, 0% agreement on dual-populated rows)
- v2 audit Section 6.5 (one canonical writer per column)
- Audit area 2: full duplicate-state inventory and disagreement rates
