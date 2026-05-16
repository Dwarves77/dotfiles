---
name: writer-operations-profile
description: Generates the 8-section operations profile for item_type=regional_data. Per-region cost baseline, feasibility of operational choices, cost comparison, cross-regional strategic implications, competitive positioning, client talking points, pending changes. Emits markdown body for intelligence_items.full_brief plus the 13-field YAML metadata block via writer-yaml-emission.
---

# Writer: Operations Profile

## Purpose

Generates `full_brief` for regional_data items. Structure preserved from original `environmental-policy-and-innovation` skill lines 349-387 (archived).

The reader question this writer answers: **in this region, what is cheaper, what is possible, what changes my plans here versus elsewhere, and how does my position compare to competitors?**

## When to use

When `item_type = regional_data` and the item is being regenerated.

## Inputs

- `intelligence_items` row + sources join + AVAILABLE SOURCES pool
- Workspace profile, specifically trade lanes and regional facility footprint (drives which region's data is relevant)
- Per [[rule-synthesis-from-primary-sources]]: actively seek the regional cost sources (national statistical offices, regulator filings, industry surveys) rather than reframe vendor-published "regional summary" content

## Outputs

- Markdown body for `intelligence_items.full_brief`
- 13-field YAML metadata block via [[writer-yaml-emission]]

## The 8 sections

### Section 1: Operational Cost Baseline for the Region

CONCRETE sourced costs that affect freight operations:
- Industrial electricity rates per kWh
- Diesel and SAF prices
- Labor rates for warehouse operations and drivers
- Port handling charges
- Drayage rates

Each line item: dated + sourced + trend direction noted where sourced. Per [[rule-no-speculation-as-fact]]: if a rate is not publicly available, the line item is labeled "current rate not publicly available" or omitted; never invented.

### Section 2: Feasibility of Specific Operational Choices

Whether the workspace can deploy specific operational solutions in this region:
- On-site solar (or whether power is monopolized by a state utility)
- BESS for peak shaving (regulatory permits, grid interconnection rules)
- Specific equipment (regional regulations, port compatibility, fuel availability)
- In-region material sourcing (regional supplier base, qualified mills, certification status)

Each feasibility question:
- The answer (possible / restricted / prohibited)
- The reason
- The source

### Section 3: Cost Comparison Against Alternatives

CONCRETE comparisons against alternatives:
- Manual labor for HVAC management versus automated BMS
- On-grid versus on-site solar (with permit and connection cost included)
- Owned facility versus leased
- In-region material sourcing versus import

Each comparison:
- Breakeven analysis
- Payback period
- Conditions where the answer flips

Sourced numbers only. Per [[rule-cause-and-effect-chain]]: each comparison carries cause (the cost driver) + mechanical consequence (the alternative's economics) + effect-by-vertical (which workspace vertical is most sensitive to the flip).

### Section 4: Cross-Regional Strategic Implications

How this region's costs and feasibilities change strategic decisions across the workspace's footprint:
- If solar is cheaper in this region and prohibited in another, what does that mean for where to consolidate operations
- Where to invest in equipment
- Where to rent versus own
- Where to source materials
- Where to locate production for products the workspace sells

### Section 5: Competitive Positioning in the Region

What competitors are doing in this region operationally. What advantages or disadvantages the workspace's position creates relative to them. Named competitors + their operational footprint, sourced.

### Section 6: Client Conversation Talking Points

How to discuss the workspace's regional capability with clients. What the workspace can credibly say about cost competitiveness, sustainability practices, and operational reliability in this region. What questions to pose to clients about their regional needs.

### Section 7: Pending Changes That Shift the Calculus

Regulations under consultation, infrastructure under construction, energy market shifts, supplier base changes that would change the cost or feasibility analysis. Trigger conditions and expected dates, sourced.

Per [[rule-synthesis-from-primary-sources]]: this section uses scheduling-source synthesis to identify pending changes.

### Section 8: Sources

Source list with type labels per [[rule-source-tier-hierarchy]].

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
- [[vocabulary-severity-labels]] (COST ALERT especially relevant; the framework's "cost increase seen early = margin protection" rationale)
- [[vocabulary-transport-modes]]
- [[vocabulary-verticals]]
- [[reference-jurisdictions]]
- [[reference-operational-scenarios]]

## Failure modes to avoid

- Cost baseline numbers without dates and sources (per [[rule-no-speculation-as-fact]])
- Feasibility framed as "may be possible" without naming the specific regulatory or infrastructural constraint
- Cross-regional implications stated as workspace-named decisions ("Dietl should move ops to X") — per [[rule-workspace-anchored-output]], generic framing
- Pending changes that are operator-paraphrases of vendor speculation rather than sourced regulator/agency signals

## Composition

Composes with [[writer-yaml-emission]] and [[writer-frame-operations]] when rendered on /operations.

## Audit cross-reference

- Original source skill lines 349-387
- v2 audit Section 2 (Operations page assessment) — page is correctly designed; data infrastructure beneath it not built
