---
name: writer-frame-operations
description: Per-surface frame for /operations. Renders the canonical item as a cost reality (per-jurisdiction compliance cost, hire-vs-automate implications, infrastructure availability). Accepts T1-T5 for facts; T6-T7 for emerging practice reports with plain-language confidence labeling per operator clarification 2026-05-15. Composes with the per-format writer; surface-specific render per v2 audit Section 6.9.
---

# Writer: Frame for /operations surface

## Purpose

Renders the canonical item under the operations/cost-reality frame. Foregrounds per-jurisdiction cost figures, hire-vs-automate decisions, infrastructure availability, regional facility implications.

Example: a Norway zero-emission fjords regulation appears on /operations as "Shore-power infrastructure requirement at Norwegian heritage-fjord ports; per-port retrofit cost ~EUR 5M [Official agency source]; affects 8 ports by 2032; consider chartering vessels with shore-power capability vs converting owned vessels."

## Per-page tier acceptance

Per operator clarification 2026-05-15: **/operations accepts T1-T5 for facts; T6-T7 for emerging practice reports** with plain-language confidence labeling at the card. Cost baseline figures and feasibility determinations require T1-T5 sources (regulator filings, statistical offices, certified industry surveys). Emerging-practice reports (e.g., a trade press article describing how a specific operator approached a regional compliance challenge) appear with the appropriate plain-language confidence label per [[rule-internal-vs-external-surface]].

## When to use

When an item is being rendered on /operations or /operations/[slug]. Item types: primarily regional_data, but also regulations/technologies with operations-cost implications.

## Inputs

- `intelligence_items` row + structured facts
- Sources row + tier (internal)
- Related items (cost benchmarks from comparable regions)
- Workspace profile (regional facility footprint, owned-vs-leased baseline, automation level)

## Outputs

Surface-specific text:
- Card body (operations frame): "Operational cost: [per-jurisdiction figure with plain-language confidence]; affects [region]; hire-vs-automate implication: [direction]; infrastructure status: [available/restricted/prohibited]"
- Hero detail-page text: operations framing
- Stat tile values: Per-Region Cost, Feasibility (possible/restricted/prohibited), Payback Period, Comparable Regions

## Process

1. Identify per-jurisdiction cost figures from structured facts; verify the source is T1-T5 for fact use OR T6-T7 with explicit confidence labeling for emerging-practice framing
2. Determine feasibility (per [[writer-operations-profile]] Section 2 framing)
3. Compute payback period if cost comparison data available; surface as plain-language ranges, not raw numeric scores
4. Identify cross-regional comparables per [[extractor-relationships]]
5. Lead with operational cost decision per [[rule-fsi-brief-framework]]
6. Apply plain-language confidence label per [[rule-internal-vs-external-surface]]

## Inherits

- All editorial rules
- [[rule-fsi-brief-framework]]
- [[rule-workspace-anchored-output]]
- [[rule-internal-vs-external-surface]] (plain-language confidence; no exposed tiers or scores)
- [[rule-cause-and-effect-chain]] (cost decisions carry the chain explicitly)
- [[vocabulary-severity-labels]] (COST ALERT common on this surface)
- [[vocabulary-transport-modes]]
- [[reference-jurisdictions]]

## Failure modes to avoid

- T6-T7 source used to render a cost baseline as if it were authoritative (cost baselines need T1-T5)
- Payback period shown as a raw numeric formula output
- Per-jurisdiction cost figures shown without source date (cost data is time-sensitive)

## Audit cross-reference

- v2 audit Section 6.9
- v2 audit Section 2 (Operations page) — page is correctly designed; needs this frame writer plus source-registry curation per [[classifier-source-onboarding]] to bring in the regional cost-data sources
- Operator clarification 2026-05-15 (per-page tier acceptance: T1-T5 facts + T6-T7 emerging practice with labeling)
