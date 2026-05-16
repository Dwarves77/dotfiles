---
name: writer-summary-card-surface
description: Generates the operator-facing card text (summary, what_is_it, why_matters) under the FSI Brief framework with integrity non-negotiables enforced AT the card layer. Translates internal source tier (T1-T7) to plain-language confidence labels per rule-internal-vs-external-surface; never exposes tier numbers, scores, or formulas. Closes audit S15 (integrity violated at card surface, not in brief).
---

# Writer: Summary Card Surface

## Purpose

Generates the dashboard card surface that operators read first. The card surface is the primary integrity battleground: the operator scans the card; if the integrity contract is honored only in the brief, the contract is violated for the operator who never clicks through.

The defining requirements:
1. Integrity non-negotiables (per-claim attribution, legal-counsel caveats, no speculation as fact) are enforced AT the card layer, not buried in `full_brief`
2. Source confidence appears as plain-language label; internal tier (T1-T7) is NEVER exposed
3. Numeric scores (urgency, sector_relevance, intersection_strength, lead_time numeric, severity numeric) are NEVER exposed
4. The card surface tells the reader: this is what we know, here's how confident we are, here's how it relates to other items, here's the source you can verify; it does NOT tell the reader the scoring methodology, the ranking formula, or the weighting matrix

## When to use

Whenever a card-surface field needs to be (re)written for an item. Triggered by:
- New item ingestion (after item_type classification but before card surfaces are exposed to operators)
- Item regeneration when `full_brief` changes (the card surface re-derives from the new brief)
- Per-surface framing recomposition (the card text varies by surface — see [[writer-frame-regulations]] etc.)

## When NOT to use

- For long-form `full_brief` content — that goes to the per-format writers ([[writer-regulatory-fact-document]] etc.)
- For YAML metadata block — that goes to [[writer-yaml-emission]]

## Inputs

- `intelligence_items` row (especially `full_brief`, `entry_into_force`, `compliance_deadline`, `severity`, `priority`)
- Structured-extracted facts from [[extractor-structured-facts]] (canonical source of truth for any specific claim)
- `sources` row joined via source_id (for INTERNAL tier and per-claim attribution; the tier translates to plain-language label at the surface, never displayed as T1-T7)
- Workspace profile

## Outputs

- `intelligence_items.summary` (~40-60 words, action-first per [[rule-fsi-brief-framework]])
- `intelligence_items.what_is_it` (~40 words, plain-language description)
- `intelligence_items.why_matters` (~40 words, operator-relevance)

## Process

1. Read full_brief and the structured extraction
2. Identify the operator action implied (per [[rule-fsi-brief-framework]] action-first; 3-second test)
3. Identify the cost dimension (specific or directional; 10-second test)
4. Identify the per-claim sources from extraction span provenance
5. Translate the source tier to a plain-language confidence label per [[rule-internal-vs-external-surface]] (NOT "T1" / "T6" — use "Primary regulatory source" / "Trade press, single source")
6. Compose summary leading with action, with per-claim attribution
7. Add legal-counsel caveat if regulatory inference per [[rule-no-regulatory-inferences-as-fact]]
8. Validate against [[rule-no-speculation-as-fact]] (no specific number/date/dollar without source)
9. Validate against [[rule-cross-reference-integrity]] (dates match structured columns)
10. Validate against [[rule-internal-vs-external-surface]] (no tier numbers, no scores, no formula references in the card text)
11. Apply character normalization per [[rule-character-normalization]]

## Output format

Plain text, 40-60 words. Structure:

- **Sentence 1: Status + Action** (3-second test). Lead with the operator action, not the regulation identifier.
- **Sentence 2: Cost** (10-second test) with inline source citation. Specific monetary figure with source OR directional range OR honest "current rate not publicly available."
- **Sentence 3: Context** (regulation name, jurisdiction, effective date) with inline source.
- **Closing clause:** legal-counsel caveat when regulatory; plain-language confidence label when source is T6-T7 ("Single source signal, unconfirmed"); lead-time annotation when forward-looking ("Surfaced 8 months before effective date").

## Plain-language confidence translation (per [[rule-internal-vs-external-surface]])

Internal tier → Card-surface label:

- T1 (binding regulatory) → "Primary regulatory source"
- T2 (official regulatory) → "Official agency source"
- T3 (legal commentary) → "Legal analysis citing primary sources"
- T4 (industry consensus) → "Industry consensus"
- T5 (market intelligence factual) → "Market intelligence"
- T6 (trade press) → "Trade press, single source"
- T7 (speculation, single-source claim, working paper) → "Single source signal, unconfirmed" or "Emerging research, not yet peer-reviewed"

Cross-reference indicators at the card surface use plain language:
- "Multiple sources corroborate"
- "Related to N other items" (N is a small integer count — counts of related items are visible; the underlying scores that ranked them are not)
- "Awaiting independent confirmation"
- "Updated in light of [reference] published [date]"

## NEVER exposed at the card surface (per [[rule-internal-vs-external-surface]])

- Tier numbers (T1, T2, T3, T4, T5, T6, T7)
- Score values (urgency_score, sector_relevance, intersection_strength, lead_time numeric, severity numeric)
- Composition formulas
- Weighting matrices
- Priority lock mechanics
- Per-sector relevance computation
- Ranking ordering rationale (items appear in the right order; the reason is implicit)

The card surface is the customer-visible product. The scoring framework is the platform's IP. Layered transparency: the outcome is what customers see; the recipe is what protects the business.

## Inherits

NON-OPTIONAL (this is the primary surface where these rules must be enforced):

- [[rule-no-regulatory-inferences-as-fact]]
- [[rule-no-speculation-as-fact]]
- [[rule-source-traceability-per-claim]]
- [[rule-cross-reference-integrity]]
- [[rule-workspace-anchored-output]]
- [[rule-fsi-brief-framework]] (action-first, four-lens, lead-time annotation)
- [[rule-source-tier-hierarchy]] (internal tier; translation to plain-language label happens here)
- [[rule-internal-vs-external-surface]] (the load-bearing presentation rule for this writer)
- [[rule-character-normalization]]
- [[vocabulary-severity-labels]]
- [[vocabulary-source-tiers]] (internal; translation table above)
- [[reference-jurisdictions]]

## Failure modes to avoid

- Stripping per-claim citations from full_brief (the gap audit S15 identified)
- Burying legal-counsel caveat in full_brief instead of card surface
- Generic "monitor developments" action language
- Vague cost ("significant", "may incur penalties")
- Inventing dates that disagree with structured `entry_into_force` column
- **Exposing the T1-T7 tier number anywhere on the card surface** (per [[rule-internal-vs-external-surface]])
- **Exposing a numeric score in operator-visible output** (urgency, sector relevance, intersection strength, lead time as raw number)
- Describing the ranking formula or methodology per-item in customer-visible copy

## Composition

Composes with:
- All per-format writers (reads their `full_brief` output)
- [[extractor-structured-facts]] (reads the canonical fact store for cross-ref integrity)
- Per-surface frame writers (this writer's output varies by which surface the card is rendered on)

## Audit cross-reference

- v2 audit Section 3 / S15 (this skill is the primary fix)
- v2 audit Section 6.10 (operator-facing data quality affordances)
- Audit area 6 finding: 100% of multi-claim summaries lack per-claim attribution
- Operator clarification 2026-05-15 (layered transparency: plain-language confidence visible, scoring mechanics hidden)
