---
name: rule-internal-vs-external-surface
description: Layered transparency. The platform's classification framework (T1-T7 source tiers), scoring values (urgency, sector_relevance, intersection_strength, lead_time numeric, severity numeric), composition formulas, weighting matrices, and ranking mechanics are INTERNAL. The card surface and customer-visible output translates these to plain-language confidence labels, plain-language cross-reference indicators, and natural item orderings. The OUTCOME of the ranking is what customers see; the RECIPE is what protects the business. Without this rule, the scoring framework is reverse-engineerable from any sample of cards.
---

# Rule: Internal vs External Surface

## Source

Operator instruction 2026-05-15 (mid-Dispatch-2.5 clarification). Codifies the competitive-moat discipline that distinguishes what customers experience (high-level confidence labels, ranked content, citation links) from what protects the business (the specific scoring framework, weights, and formulas that produce the ranking).

The pattern is layered transparency. Bloomberg, Reuters, AP do this: they surface "primary source," "two people familiar with the matter," "single source unconfirmed" as confidence language without exposing their editorial scoring frameworks or ranking weights. Caro's Ledge follows the same pattern.

## The boundary

| At the card surface and any customer-visible output (reader sees) | Internal to the platform (never exposed) |
|---|---|
| Plain-language source confidence ("Primary regulatory source," "Industry consensus," "Single source signal, unconfirmed," "Emerging research") | T1-T7 tier numbers |
| Citation link to primary source (reader can verify directly) | Specific tier assignment per source as a label |
| Plain-language cross-reference ("Related to 3 other items," "Multiple sources corroborate") | intersection_strength score values |
| Time signals ("Effective in 90 days," "Published 3 days ago") | lead_time computed numeric values |
| Workspace relevance indicators ("High relevance to your live-events portfolio") OR just natural item orderings | sector_relevance scores |
| Action owner, status, workspace notes | Composition formulas, weighting matrices, priority lock mechanics |
| Severity pill ("ACTION REQUIRED", "COST ALERT", etc.) | severity numeric or score representation |

The ranking system is the secret sauce. What customers experience is the OUTCOME of the ranking (cards in the right order, with appropriate confidence indicators). What they don't see is the WHY (scores, weights, tier numbers, formulas).

## Why this matters competitively

If a competitor sees "T7: single source, unconfirmed" on every relevant card, they can:
- Reverse-engineer the tier framework
- Build a copycat classifier in days
- Match the surface presentation without doing the actual classification work

If a competitor sees "Single source signal, unconfirmed" on the same card:
- They see the confidence outcome but not the framework
- Replicating the framework requires independent investment
- The competitive moat is preserved

Same principle for ranking. Showing "Urgency: 87" reveals a score. Showing items in priority order without a number reveals the OUTCOME of ranking. The outcome is what customers pay for; the recipe is what protects the business.

## Plain-language confidence translation (internal tier → external label)

The canonical translation from [[vocabulary-source-tiers]] T1-T7 to plain-language card-surface labels:

| Internal (never exposed) | External (card surface) |
|---|---|
| T1 (binding regulatory) | "Primary regulatory source" |
| T2 (official regulatory) | "Official agency source" |
| T3 (legal commentary) | "Legal analysis citing primary sources" |
| T4 (industry consensus) | "Industry consensus" |
| T5 (market intelligence factual) | "Market intelligence" |
| T6 (trade press) | "Trade press, single source" |
| T7 (speculation, single-source claim, working paper) | "Single source signal, unconfirmed" OR "Emerging research, not yet peer-reviewed" |

## Plain-language cross-reference translation

| Internal (never exposed) | External (card surface) |
|---|---|
| `intersection_strength = 12` | "Multiple sources corroborate" |
| `intersection_strength = 8-11` | "Related to N other items" (N is the count of related items, plain integer; the strength score that ranked them is not shown) |
| `intersection_strength < 8` | "Awaiting independent confirmation" OR no cross-reference indicator at all |
| `related_items` UUIDs | Inline title references in `intersection_summary` (titles, never UUIDs) |
| `lead_time = 245 days` (computed) | "Surfaced 8 months before effective date" |
| `urgency_score = 87` | Position in priority list; severity pill |
| `sector_relevance_score = 0.92` | "High relevance to your live-events portfolio" OR natural ordering |

## What NEVER appears at any customer-visible surface

- Tier numbers (T1, T2, T3, T4, T5, T6, T7)
- Numeric score values (urgency_score, sector_relevance, intersection_strength, lead_time numeric, severity numeric, priority numeric)
- Composition formulas
- Weighting matrices
- Priority lock mechanics (severity-to-priority mapping is enforced internally; not displayed as a rule)
- Per-sector relevance computation details
- Ranking ordering rationale (items appear in the right order; the reason is implicit)
- Internal classification axis names (source_role, intersection_strength, sector_relevance, composition weights)
- Schema column names (penalty_range, cost_mechanism, enforcement_body, intelligence_items.market_data)
- Internal phase identifiers ("Phase D", "Wave 1c")
- Pipeline component names ("ingestion worker", "source registry rollup endpoint")

## Failure mode signatures

1. A tier number appears anywhere on the card surface ("T6", "T7", etc.)
2. A numeric score appears in operator-visible output ("Urgency: 87", "Relevance: 0.92")
3. The ranking formula or methodology is described per-item in customer-visible copy ("This item ranked higher because intersection_strength × sector_relevance × priority_weight = ...")
4. Internal classification axes appear in copy (intersection_strength, sector_relevance, composition weights)
5. Schema column names appear in empty-state copy ("when intelligence_items.market_data is populated")
6. Internal phase or sprint identifiers appear in copy ("Phase D feature")

## What the card surface tells the reader

The card surface tells the reader: **this is what we know, here's how confident we are, here's how it relates to other items, here's the source you can verify.** The card surface does NOT tell the reader: here's our scoring methodology, here's our ranking formula, here's our weighting matrix.

## Public marketing and documentation language

Public marketing language can describe the abstract approach without revealing the specifics of HOW each is computed:

- "Caro's Ledge ranks items by relevance to your operations, urgency, lead time, and cross-reference strength" — acceptable (abstract)
- "Caro's Ledge uses a T1-T7 source-tier framework with weights of 4/3/2/1 for priority levels and a +3/+2/+5 intersection scoring formula" — NOT acceptable (reveals specifics)

When discussing the platform in marketing, sales material, or public-facing docs, use abstract language ("authoritative primary sources," "rigorous source classification," "transparent confidence indicators") without revealing the specific tier structure, count, or assignment criteria.

## Admin debugging exception

Workspace admin views MAY surface internal scores for debugging purposes, gated to the admin role only. End workspace members never see scores. This exception is narrow:
- Admin sees a debug panel with `urgency_score: 87, sector_relevance: 0.92, intersection_strength: 14, source_tier: T6` for a given item
- The debug panel is admin-role-gated per [[rule-group-scoped-features]]
- Non-admin workspace members never see this panel
- Public API endpoints never return these fields
- The debug panel is accessed from a non-default UI route the operator opts into

## Composition

- Inherited by: [[writer-summary-card-surface]] (the primary battleground for this rule), every [[writer-frame-regulations]] / [[writer-frame-market]] / [[writer-frame-research]] / [[writer-frame-operations]] (each frame translates internal values to plain-language surface text), [[writer-operator-empty-states]] (empty-state copy never leaks schema or pipeline names)
- Composes with: [[rule-source-tier-hierarchy]] (the internal tier framework this rule keeps internal), [[rule-cross-reference-integrity]] (the integrity contract is about claim accuracy, not score exposure)
- Affects: the rendering layer, the public API surface, the marketing/docs language

## What this rule is NOT

- Not a prohibition on transparency. The card surface IS transparent about confidence (plain-language label), source (citation link), and cross-references (plain-language indicators). The reader can verify everything they need to weight a claim.
- Not a prohibition on internal tooling. Admin debug views, internal dashboards, and developer-facing logs MAY surface internal values. The rule is about CUSTOMER-VISIBLE output.
- Not a substitute for accuracy. Layered transparency without accuracy is a fraud; this rule sits on top of the integrity rules ([[rule-no-speculation-as-fact]], [[rule-no-regulatory-inferences-as-fact]], [[rule-cross-reference-integrity]]), not in tension with them.

## Audit cross-reference

- v2 audit Section 6.10 (operator-facing data quality affordances)
- Chrome audit 5.1 (developer-facing placeholders reaching operator surface — the source of writer-operator-empty-states; this rule generalizes the principle)
- Operator instruction 2026-05-15 (the explicit articulation that produced this rule, in response to a tier-labeling proposal that would have exposed the framework)
- Future source-registry-hygiene dispatch (will audit current rendering surfaces for tier-number leaks and score exposure; corrective rendering fixes scoped there)
