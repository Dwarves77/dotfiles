---
name: writer-frame-market
description: Per-surface frame for /market. Renders the canonical item as a competitive signal (peer adoption, cost of inaction, lead-time advantage). Accepts T1-T7 with plain-language confidence label at the card per rule-internal-vs-external-surface. Composes with the per-format writer; surface-specific render per v2 audit Section 6.9.
---

# Writer: Frame for /market surface

## Purpose

Renders the canonical item under the market-signal frame. Foregrounds competitive positioning, cost-of-inaction, peer adoption pace, lead-time value.

Example: the same Norway zero-emission fjords regulation appears on /regulations as "EFFECTIVE Jan 1, 2025; ocean mode; ACTION NOW: assess fleet" and on /market as "Norway moves first on fjord ZE — competitive signal for cruise/luxury maritime peers operating in Nordic waters."

## Per-page tier acceptance

Per operator clarification 2026-05-15: **/market accepts T1-T7** with plain-language confidence labeling at the card. Trade press (T6) and single-source unconfirmed (T7) are PART of competitive lead time; catching signals before they're confirmed is the point.

The card surface displays the plain-language confidence label per [[rule-internal-vs-external-surface]], translated from the internal tier:
- T1-T2 → "Primary regulatory source" / "Official agency source"
- T3 → "Legal analysis citing primary sources"
- T4 → "Industry consensus"
- T5 → "Market intelligence"
- T6 → "Trade press, single source"
- T7 → "Single source signal, unconfirmed" / "Emerging research, not yet peer-reviewed"

NEVER expose the T1-T7 tier number itself.

## When to use

When an item is being rendered on /market or /market/[slug]. The item may have item_type=market_signal (its native home) OR it may be a regulation/technology surfacing on /market because of competitive implications. Source tier may be T1-T7.

## Inputs

- `intelligence_items` row + structured facts
- Sources row + tier (internal)
- Workspace profile (verticals, modes, lanes, competitive positioning)
- Related items (competitor moves on the same axis)

## Outputs

Surface-specific text:
- Card body (market frame): "Competitive signal: [who] [what], [date]; cost of inaction: [scale]; [confidence label]"
- Hero detail-page text: market framing
- Stat tile values: Lead Time, Peer Adoption Rate, Cost of Inaction (directional, never numeric score)

## Process

1. Identify the competitive actor (named or anonymized per [[rule-workspace-anchored-output]] for the workspace itself)
2. Compute lead time per [[compute-lead-time]]; surface as plain-language ("Surfaced 8 months before effective date") not as raw numeric value
3. Identify peer adoption pace from related items per [[extractor-relationships]]; surface as plain-language ("Multiple sources corroborate" / "Awaiting independent confirmation") not as a count or score
4. Compose cost of inaction (directional or specific with source)
5. Lead with competitive signal per [[rule-fsi-brief-framework]]
6. Apply plain-language confidence label per [[rule-internal-vs-external-surface]]

## Inherits

- All editorial rules
- [[rule-fsi-brief-framework]] (action-first, four-lens, lead-time annotation)
- [[rule-workspace-anchored-output]]
- [[rule-internal-vs-external-surface]] (plain-language confidence labels; no exposed tiers or scores)
- [[rule-source-vs-resource-distinction]] (a vendor's NEW product launch IS a market signal; the vendor's mere existence is NOT)
- [[vocabulary-severity-labels]] (COMPETITIVE EDGE, COST ALERT especially relevant)
- [[vocabulary-source-tiers]] (internal)
- [[reference-jurisdictions]]
- [[compute-lead-time]] (computed value; surfaced as plain-language not numeric)

## Failure modes to avoid

- T1-T2 binding regulatory items shown without the upgrade to /regulations (these items should also render on /regulations under [[writer-frame-regulations]] as the primary surface; /market is the secondary competitive-framing surface)
- T6-T7 items without confidence labeling (reader cannot weight the signal)
- Lead time exposed as a numeric value ("Lead time: 245 days") rather than plain-language ("Surfaced 8 months before effective date")
- Peer adoption shown as a count ("3 of 7 peers have adopted") that reveals scoring rather than plain-language ("Multiple peers have adopted")

## Audit cross-reference

- v2 audit Section 6.9
- v2 audit Section 2 (Market Intel page) — page is correctly designed; needs this frame writer to deliver
- Operator clarification 2026-05-15 (per-page tier acceptance; layered transparency for confidence)
