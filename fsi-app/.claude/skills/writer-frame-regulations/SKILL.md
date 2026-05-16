---
name: writer-frame-regulations
description: Per-surface frame for /regulations. Renders the canonical item under the regulatory frame (effective date, compliance deadline, penalty schedule, enforcement body, what-do-I-do action). Accepts T1-T5 only (regulatory items must be authoritative per operator clarification 2026-05-15). Tier surfaces as plain-language confidence label per rule-internal-vs-external-surface. Composes with the per-format writer; this is the surface-specific render layer per v2 audit Section 6.9.
---

# Writer: Frame for /regulations surface

## Purpose

Renders the canonical item content under the regulatory frame. The same canonical item may also be rendered under other surface frames ([[writer-frame-market]], [[writer-frame-research]], [[writer-frame-operations]]) on other pages — each frame foregrounds different aspects of the same item.

Per v2 audit Section 6.9, this is how the cross-page same-item-different-chrome failure (S1) is resolved: the item is canonical; the frame is per-surface.

## Per-page tier acceptance (CRITICAL)

Per operator clarification 2026-05-15: **/regulations accepts T1-T5 ONLY.** Regulatory items must be authoritative. T6-T7 (trade press, single-source unconfirmed claims) do NOT appear on /regulations regardless of how they would be labeled. Items at T6-T7 with regulatory implications surface on /market under [[writer-frame-market]] with appropriate plain-language confidence labeling.

The acceptance gate runs at [[classifier-page-routing]]; this writer enforces it by refusing to render items whose source is T6-T7. If such an item reaches this writer, it is routed back to /market.

## When to use

When an item is being rendered on /regulations or /regulations/[slug] AND its source tier is T1-T5. Read the canonical item + structured facts; emit the regulatory-frame card text + detail-page sections.

## When NOT to use

- /market: use [[writer-frame-market]]
- /research: use [[writer-frame-research]]
- /operations: use [[writer-frame-operations]]
- Item is T6-T7: route to /market under [[writer-frame-market]]

## Inputs

- `intelligence_items` row + structured facts from [[extractor-structured-facts]]
- `sources` row + tier per [[vocabulary-source-tiers]] (internal tier; never exposed at card)
- Workspace profile

## Outputs

Surface-specific text:
- Card body (regulatory frame): "Effective [date]; [mode]; [confidence label per rule-internal-vs-external-surface]; ACTION NOW: [verb]"
- Hero detail-page text: regulatory framing
- Stat tile values: Effective, Compliance Deadline, Penalty Range, Owner

The item's `summary`, `what_is_it`, `why_matters` from [[writer-summary-card-surface]] are the underlying text source; this writer chooses which aspects to foreground.

## Process

1. Verify the source tier is T1-T5. If T6-T7, route to /market.
2. Read structured facts (effective_date, compliance_deadline, penalty_range, enforcement_body, legal_instrument).
3. Compose card body leading with "EFFECTIVE [date]" or "IN FORCE" status.
4. Surface penalty schedule when present; honest empty state when absent (per [[writer-operator-empty-states]]).
5. Surface compliance deadline as countdown when within 90 days.
6. Lead with operator action per [[rule-fsi-brief-framework]].
7. Apply plain-language confidence label per [[rule-internal-vs-external-surface]]; do NOT expose the T1-T5 tier number.
8. Apply per-claim attribution per [[rule-source-traceability-per-claim]] at the card surface.
9. Apply legal-counsel caveat per [[rule-no-regulatory-inferences-as-fact]] when the card surface contains imperative compliance instruction.

## Inherits

- All editorial rules (no-speculation, no-regulatory-inferences, source-traceability, cross-reference-integrity, source-tier-hierarchy, character-normalization, synthesis-from-primary-sources, cause-and-effect-chain)
- [[rule-fsi-brief-framework]] (action-first, four-lens, lead-time annotation)
- [[rule-workspace-anchored-output]] (workspace context)
- [[rule-internal-vs-external-surface]] (plain-language confidence label, no exposed tier numbers or scores)
- [[vocabulary-severity-labels]]
- [[vocabulary-source-tiers]] (internal; translation to plain-language label happens at the card)
- [[reference-jurisdictions]]

## Failure modes to avoid

- Card surface exposes "T1" / "T5" labels (per [[rule-internal-vs-external-surface]])
- Card surface exposes urgency_score, sector_relevance_score, intersection_strength_score
- T6-T7 item rendered here (should have been routed to /market by [[classifier-page-routing]])
- Lead with regulation identifier rather than action (per [[rule-fsi-brief-framework]] 3-second test)
- Missing legal-counsel caveat at card surface when imperative compliance language appears

## Composition

Reads from per-format writer output ([[writer-regulatory-fact-document]] primarily; can read from [[writer-technology-profile]] when a technology item has regulatory implications surfaced here with a T1-T5 source). Reads from [[extractor-structured-facts]].

## Audit cross-reference

- v2 audit Section 6.9 (per-surface framing as a derived view)
- v2 audit Section 3 / S1 (single detail-page route — this skill is part of the fix)
- Operator clarification 2026-05-15 (per-page tier acceptance: /regulations T1-T5 only; tier framework is internal)
