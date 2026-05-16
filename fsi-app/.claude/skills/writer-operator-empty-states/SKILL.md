---
name: writer-operator-empty-states
description: Operator-language empty-state copy. Replaces developer-facing placeholder copy that leaks schema field names ("when the ingestion worker populates penalty_range / cost_mechanism / enforcement_body...") with operator-language alternatives. Composes with rule-no-speculation-as-fact (no false promises about when data will arrive) and rule-internal-vs-external-surface (no schema column names exposed). Closes audit S3 + Chrome 5.1.
---

# Writer: Operator Empty States

## Purpose

When a tile, tab, or section has no data to render, this writer composes the operator-facing empty-state copy. The current production system leaks developer language and schema field names into operator chrome (per audit S3 + Chrome 5.1):

- PenaltyCalculatorPanel: "When the ingestion worker populates penalty_range / cost_mechanism / enforcement_body, the schedule will appear here."
- Market Intel KEY METRICS: "Quantitative metrics not yet populated... once intelligence_items.market_data is populated."
- Operations: "Coming soon — Phase D"
- AffectedLanesCard: "Lane-pair, volume, and origin/destination data not yet in schema"

These all leak the names of incomplete pipeline components to the operator. This skill replaces them with empty-state copy that:

1. Acknowledges the gap honestly
2. Does NOT expose schema field names (per [[rule-internal-vs-external-surface]])
3. Does NOT expose internal phase milestones ("Phase D" is internal vocabulary)
4. Suggests what the operator can do or check in the meantime
5. Maintains the integrity contract per [[rule-no-speculation-as-fact]] (don't pretend data exists when it doesn't; don't pretend there's more if there isn't)

## When to use

For every tile, tab, or section that may render empty. Triggered at render time, not at write time — empty states are surface-specific UI copy, not stored data.

## When NOT to use

- When the tile DOES have data — render the actual data. Don't compose around it.
- When the data is genuinely "coming soon" because there's an active workstream to populate it AND the operator should know that (e.g., a feature in beta) — that's a different message than this skill produces. This skill produces empty-state copy for current state, not roadmap promises.

## Inputs

- The tile/tab/section name (penalty_calculator, owner_team, affected_lanes, etc.)
- The reason the data is empty (schema column doesn't exist; column exists but null; coverage gap from sources; etc.)
- Workspace profile (some empty states reference workspace context)

## Outputs

Operator-language strings, ~10-30 words each, structured by surface:

### Penalty Calculator (currently leaking schema names)
- **Replace:** "When the ingestion worker populates penalty_range / cost_mechanism / enforcement_body, the schedule will appear here."
- **With:** "Penalty schedule not yet sourced for this regulation. Verify with regulator publication or legal counsel."

### Owner Team Card (currently leaking via "Unassigned")
- **Replace:** "Unassigned"
- **With (when owner attribution is added):** shows owner.
- **With (when still empty):** "Owner not yet assigned. Configure owner attribution in workspace settings."

### Affected Lanes Card
- **Replace:** "Lane-pair, volume, and origin/destination data not yet in schema"
- **With:** "Lane-level exposure not yet integrated with workspace shipment data."

### Market Intel KEY METRICS
- **Replace:** "Quantitative metrics not yet populated for this section. Items in scope have lifecycle and source attribution; numeric deltas (current vs prior period) will appear here once intelligence_items.market_data is populated."
- **With:** "Quantitative metrics not yet sourced for this technology category."

### Operations Coming Soon banner
- **Replace:** "Operations data points (solar, electricity, labor, EV charging, green building) for this jurisdiction will populate here as the source monitoring system ingests them."
- **With:** "Operations cost data not yet sourced for this jurisdiction."

### Research Coverage Matrix
- **Replace:** "Coverage values are placeholders pending the source registry rollup endpoint."
- **With:** "Coverage matrix in development." (or, when matrix is real, render the matrix)

## Process

1. Identify the surface and the empty reason
2. Check if there's a workspace-action recommendation that fits ("Configure X in workspace settings")
3. Check if there's a source-action recommendation ("Verify with [source]")
4. If neither, render an honest "not yet sourced / not yet integrated" string
5. Never expose schema column names; never expose phase milestones; never expose internal scoring or tier values

## Inherits

- [[rule-no-speculation-as-fact]] — empty state is not a place to speculate about when data will arrive
- [[rule-workspace-anchored-output]] — empty states reference workspace settings without naming the workspace
- [[rule-internal-vs-external-surface]] — schema column names, internal phase identifiers, tier numbers, and score values are NEVER in customer-visible empty-state copy
- [[rule-character-normalization]] — applies at emission

## Failure modes to avoid

- Exposing schema column names (penalty_range, cost_mechanism, enforcement_body, intelligence_items.market_data)
- Exposing internal phase identifiers ("Phase D")
- Exposing pipeline component names ("ingestion worker", "source registry rollup endpoint")
- Promising data arrival timelines without commitment ("will populate here as...")

## Audit cross-reference

- v2 audit Section 3 / S3 (schema-renderer contract; placeholders that leak schema names)
- Chrome audit 5.1 (developer-facing placeholders reaching operator surface)
- v2 audit Section 6.10 (operator-facing data quality affordances)
- Operator clarification 2026-05-15 (layered transparency: internal mechanics never reach customer surface)
