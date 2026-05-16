---
name: rule-fsi-brief-framework
description: Every operator-facing output leads with action, then cost, then context. The 3-second / 10-second / 30-second test is the writer-prompt acceptance criterion. Lead time is the competitive frame the brief is anchored against.
---

# Rule: FSI Brief framework (action → cost → context)

## Source

Operator brief 2026-05-15: "Every item, regardless of page, leads with action, then cost, then context. The operator should know within three seconds what they would do differently, then within ten seconds what it costs, then within thirty seconds the underlying context. Items leading with context have failed the framework. Items leading with action have succeeded."

## The three-second test

Within ~50 characters of the start of the visible card surface, the operator should know what they would do differently.

- Pass: "ACTION NOW: Access THETIS-MRV to verify carrier emissions data..."
- Pass: "REGULATORY STATUS UNCERTAIN. Track via Federal Register. Do NOT rely on federal rollback..."
- Fail: "The EBA homepage provides an overview of ongoing regulatory consultations..."
- Fail: "Regulation 2023/1804 of the European Parliament and Council establishes..."

If the first sentence describes the source rather than the action, the framework fails.

## The ten-second test

Within ~150 characters of the start, the operator should know what it costs (or what scale of cost is implied).

Cost can be:
- A specific monetary figure with source: "ETS cost ~€2,400/tonne CO2e"
- A directional range: "Cost impact: low single-digit margin points, exact figure not publicly disclosed"
- A binary: "Compliance failure penalty: regulator-determined; assume material per past CARB enforcement"
- A timing cost: "Adds 30 days to compliance prep cycle"

If no cost dimension is named within ~150 characters, the framework fails. Generic "may incur penalties" or "significant costs" are not concrete.

## The thirty-second test

Within ~500 characters of the start, the operator should have the underlying context (regulation name, jurisdiction, effective date, who is affected). The card surface is meant to be scanned in 30 seconds total.

If the operator needs to click through to the detail page just to know what regulation this is about, the card surface failed.

## The audit-measured failure rate

99.5% of cards on the live site lead with context, not action (audit area 6, sample N=183). Action signal anywhere in the first 200 chars: 8.7%. Cost signal anywhere in the first 200 chars: 12.6%. The framework is honored in 25% of rows regenerated under the B.2 contract; the 75% legacy population fails it completely.

## Action language: operator-relevant vs generic

Operator-relevant action verbs:
- "Access THETIS-MRV..."
- "Build ISO 14083-aligned shipment-level emissions reporting..."
- "Map AFIR charging/H2 infrastructure on your key European freight corridors..."
- "Verify airline ETS surcharge methodology..."
- "Request carrier-specific emissions factors..."
- "Track rule status through Federal Register..."

Generic action verbs (do not use):
- "Monitor developments..."
- "Comply with the regulation..."
- "Be aware of upcoming changes..."
- "Consider the implications..."
- "Stay informed about..."

If the card lacks an operator-relevant action verb, the writer rewrites until one fits or honestly acknowledges the item carries no operator-relevant action ("Awareness only: no action required at this stage").

## The four-lens requirement

Every brief, regardless of format, serves four lenses where facts permit. This is the editorial structure that the action-cost-context framing operates within. The action-cost-context test is HOW the brief opens; the four lenses are WHAT the brief covers.

The four lenses (from original `environmental-policy-and-innovation` source lines 91-98):

1. **Substantive content lens.** What is the regulation, technology, market signal, regional cost picture, or research finding. The facts of the matter, sourced.
2. **Competitive lens.** What this means for the workspace's position relative to competitors. Who has access, who is moving, who is positioned to win or lose contracts on the basis of this content.
3. **Client-conversation lens.** What the workspace can credibly say about this content in a client meeting. What questions the workspace can pose to demonstrate sophistication. What pitfalls to avoid (overclaiming on technology not yet deployed at scale, citing studies the workspace has not read).
4. **Action lens.** What the workspace does now, with specific moves rather than generic "monitor developments."

Every brief addresses all four where facts permit. A regulatory fact document foregrounds the substantive lens but Section 3 (Issues Requiring Immediate Action) covers action; Section 11 (Operational System Requirements) implies competitive positioning when peers have already built; client-conversation framing appears in talking-point sections. A technology profile foregrounds the competitive lens but every section also serves substantive, conversation, and action.

A brief that serves only the substantive lens (passive summary) is incomplete. A brief that serves only the action lens (recommendations without sourced facts) is unsupported. The four lenses are simultaneous, not sequential.

### When a lens cannot be served

Per [[rule-no-speculation-as-fact]], when facts are not sourced for a given lens, the writer omits that lens for the brief in question with an explicit acknowledgment. Example: "Competitive positioning not assessable from available sources; named-competitor activity in this area has not been publicly reported as of [date]." This is consistent with the integrity rules — better to acknowledge a missing lens than to fill it with invention.

### How the lenses interact with the action-cost-context test

The opening sentences of the brief (3-second test action, 10-second test cost, 30-second test context) hit the action and substantive lenses first. The competitive and client-conversation lenses unfold in the deeper sections. A reader scanning the card surface gets action + cost; a reader scanning the brief opening gets action + cost + context + initial competitive signal; a reader of the full brief gets all four lenses.

## Lead time as the competitive frame

Operator brief: "The competitive frame is lead time: does the operator find out before competitors, before customers ask, before regulators enforce? Every item is evaluated against this lens. An item with a 6-month lead time on a competitor's move is more valuable than the same item after the move is public. Value compounds with earlier surfacing."

Every card carries an explicit lead-time annotation when applicable:
- "Surfaced 8 months before effective date" (forward-looking regulation)
- "Surfaced 14 days before public competitor announcement" (early competitive signal)
- "Reactive: surfaced 60 days after enforcement" (catalog item, no lead-time value)

If lead time cannot be computed (no `source_publication_date` or `entry_into_force`), the card omits the annotation rather than misrepresenting it.

See [[compute-lead-time]] for the computation; this rule defines how lead time is surfaced to the operator.

## Composition

Every writer inherits this rule:
- [[writer-summary-card-surface]] — the writer this rule is most directly designed to constrain
- [[writer-regulatory-fact-document]] / [[writer-technology-profile]] / etc. — apply to the brief's opening section, which is what surfaces in card excerpts
- [[writer-frame-regulations]] / [[writer-frame-market]] / [[writer-frame-research]] / [[writer-frame-operations]] — each surface frame leads with action specific to that page's operator question

Composes with:
- [[rule-no-regulatory-inferences-as-fact]] — action language with legal-counsel caveat
- [[rule-no-speculation-as-fact]] — concrete cost language with source citation
- [[rule-source-traceability-per-claim]] — cited at card layer when costs are specific
- [[compute-lead-time]] — computes the value the lead-time annotation displays

## Audit cross-reference

- v2 audit Section 1 (executive verdict on FSI Brief framework gap)
- v2 audit Section 6.5 (structured fact extraction enables specific cost language)
- Audit area 6: 99.5% context-first failure rate measured
