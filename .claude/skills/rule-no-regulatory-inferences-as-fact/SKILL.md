---
name: rule-no-regulatory-inferences-as-fact
description: Integrity non-negotiable. Never present regulatory interpretation as confirmed legal fact. State what the regulation says, where it is silent, where authoritative guidance addresses the gap. Direct the operator to legal counsel for interpretation. Required on every card surface that mentions a regulation or compliance obligation.
---

# Rule: No regulatory inferences as fact

## Source

Operator brief 2026-05-15: "No regulatory inferences presented as fact. When a legal source is relevant, state it exists, summarize its operational implications, and direct the operator to legal counsel for interpretation. Never pre-empt legal analysis. Applies to PPWR, IMO, ICAO, EPA, CARB, and all frameworks."

## What this means

When a regulation has been issued, you are allowed to:
- State the regulation exists, with citation
- Summarize its operational implications in workspace terms
- Identify what is decided versus what remains unresolved
- Recommend the operator consult legal counsel for interpretation

You are not allowed to:
- Assert a compliance obligation as definitive ("operators must X") without an explicit "consult legal counsel" caveat at the same surface where the assertion appears
- State a penalty amount as binding ("Penalties of $X per violation") without source citation in the same sentence and a caveat that final amount is determined by enforcement
- Tell the operator what to do in legally ambiguous areas without flagging the area as legally ambiguous
- Pre-empt legal interpretation of statutory language whose meaning is contested or undefined

## When the caveat must appear

The caveat appears AT THE CARD LAYER, not buried in `full_brief`. The operator reads the card surface (`summary`, `what_is_it`, `why_matters`) before they read the brief. If the integrity caveat lives only in the brief, the integrity contract is violated for the operator who scans the card.

The audit found 31.3% of regulation/directive/standard rows with `full_brief` issue imperative obligation language ("operators must," "ACTION NOW," "Owner:") in the visible card surface without any caveat at that surface. This is the failure mode this rule is designed to prevent.

## Required language patterns

When the card surface contains an imperative compliance instruction or a specific penalty figure for a regulation, append one of:

- "Consult legal counsel for jurisdiction-specific interpretation."
- "Final penalty amount determined by enforcement; consult counsel."
- "This summary describes the regulation's stated requirements; legal interpretation belongs to qualified counsel."
- "Workspace-specific compliance posture requires legal review."

The caveat is not optional and not abbreviatable. It must appear in the visible card text, not in a tooltip, not in a hover, not in a tab the operator may never click.

## Failure example (from production, audit 2026-05-15)

Trump Administration Repeals EPA Endangerment Finding item:
- Compliance Obligation scored 3/3 High (semantically backwards — repeal removes federal regulatory authority)
- Summary asserts the repeal "eliminating federal authority to regulate" without qualifying that endangerment-finding repeals are typically subject to APA review and have historically been enjoined
- Surfaced as IMMEDIATE / REGULATION on the dashboard's top-priority surface

This is the most consequential possible form of the violation: a politically charged news event presented as binding regulatory fact, with backwards scoring, on the operator's most-attended surface.

## Success example

EU MRV Regulation (B.2 regenerated):
"IN FORCE. Expanded scope from 2025. MRV data is now the single source of truth for maritime carbon compliance in the EU. ACTION NOW: Access THETIS-MRV to verify carrier emissions data used for surcharge calculations. Request carrier-specific emissions factors for ISO 14083 reporting. Owner: Sustainability + Ocean Product. Consult legal counsel for jurisdiction-specific interpretation."

The action is operator-relevant. The cost is implied. The source is structured. The caveat is at the card layer, not buried.

## Composition

This rule is part of [the four integrity non-negotiables](../INDEX.md#rules-7--composable-contracts-every-writerclassifier-inherits) from the operator brief. The other three are:
- [[rule-no-speculation-as-fact]]
- [[rule-source-traceability-per-claim]]
- [[rule-cross-reference-integrity]]

Every writer ([[writer-regulatory-fact-document]], [[writer-summary-card-surface]], etc.) inherits this rule. Every classifier ([[classifier-severity-priority]], [[classifier-page-routing]]) checks against it before assigning labels that imply binding obligation.

## Audit cross-reference

- v2 audit Section 3 / S15 (integrity non-negotiables violated at the card surface, not in the brief)
- v2 audit Section 6.10 (operator-facing data quality affordances)
- Chrome audit 5.3 (Trump EPA endangerment-finding case study)
