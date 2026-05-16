---
name: rule-cause-and-effect-chain
description: Every data point in every operator-facing brief carries a cause + mechanical consequence + effect-by-vertical chain. The chain is sourced at every link. Data without the chain is noise and is never emitted. This is the editorial discipline that distinguishes a workspace-anchored brief from a generic regulatory summary.
---

# Rule: Cause and effect chain

## Source

Operator brief and original `environmental-policy-and-innovation` skill lines 144-164 (archived at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`). The Cause and Effect Requirement was foundational to the source skill and is preserved here as a discrete rule that every writer and frame inherits.

## What this rule requires

Every data point on every operator-facing surface (card body, brief section, surface frame) carries a three-link chain:

1. **Cause** — what is happening (the regulatory event, market move, technology deployment, research finding)
2. **Mechanical consequence** — the direct mechanical effect (the surcharge, the registration deadline, the operational change, the capability gain)
3. **Effect by vertical** — what the mechanical consequence means for each cargo vertical the workspace operates in

Each link is sourced. The cause cites the originating source (regulation text, press release, paper). The mechanical consequence cites the source that describes the consequence (regulator FAQ, industry analysis, carrier filing). The effect-by-vertical cites the source that describes the per-vertical incidence OR is honestly labeled "effect on [vertical] requires carrier-specific data" when no source exists.

A data point without the full chain is noise. The writer does NOT emit it. Per the source skill: "Data without cause and effect is noise. Never output it."

## The canonical example (from source skill lines 156-160)

A SAF mandate is the cause. Surcharge pass-through is the mechanical consequence. The per-vertical incidence varies and each variation is sourced:

> - Cause: "ReFuelEU mandates 2% SAF blend at EU airports from January 2025." *Source: ReFuelEU Aviation Regulation Article 4.*
> - Mechanical consequence: "SAF costs 3-4x conventional jet fuel; carriers pass through as fuel surcharge." *Source: IATA fuel cost reporting, Q1 2025.*
> - Effect for live-events vertical: "Tour equipment shipments departing EU airports carry this surcharge, escalating annually." *Source: workspace operational profile, applied to airline surcharge schedules.*
> - Effect for fine-art vertical: "Temperature-controlled art shipments on EU-origin lanes see the same surcharge with no alternative fuel option for the foreseeable future." *Source: SAF availability data, ICAO SAF Dashboard.*
> - Effect for humanitarian vertical: "Aid cargo departing EU may qualify for surcharge exemptions; requires carrier-specific verification." *Source: Carrier humanitarian rate tariffs, where published.*

Every link is sourced. The vertical-specific framing comes from the workspace profile, not from invention.

## Behavior when the chain breaks

When a link is missing or unsourced:

- **Cause unsourced:** the data point is not emitted. There is no surface where unsourced facts are acceptable.
- **Mechanical consequence unsourced:** the data point is not emitted as a workspace-actionable claim. It may appear under "research gap" framing if the cause is sourced and the gap itself is the salient signal.
- **Effect-by-vertical unsourced for a given vertical:** the writer labels that vertical's effect with "Effect on [vertical] requires carrier-specific data" OR a per-vertical research-gap acknowledgment. The data point is NOT dropped wholesale; the per-vertical line is honestly empty.

A writer that emits a brief with "cause sourced, consequence sourced, vertical effects all populated with no per-vertical sources" is fabricating the vertical-specific framing. This is the failure mode this rule is designed to prevent.

## Where the chain appears in writers

This rule fires at writer emission time. The chain shape varies by format:

| Writer | Where the chain appears |
|---|---|
| `writer-regulatory-fact-document` | Section 8 (Substantive Requirements) subsections; Section 3 (Issues Requiring Immediate Action) action items; Section 11 (Operational System Requirements) requirement-level chains |
| `writer-technology-profile` | Section 1 (Tested or Deployed) operator activity; Section 4 (Operational Fit) per-mode/per-vertical incidence |
| `writer-operations-profile` | Section 2 (Feasibility) per-choice analysis; Section 3 (Cost Comparison) per-alternative chains |
| `writer-market-signal-brief` | Section 4 (Operational and Cost Implications) per-vertical incidence |
| `writer-research-summary` | Section 2 (Why It Matters Operationally) per-vertical mechanism |
| `writer-summary-card-surface` | Card body's middle sentence (cost dimension) when a cause-consequence-effect chain compresses to operator-action language |
| `writer-frame-regulations` / `-market` / `-research` / `-operations` | Each frame surfaces a vertical-specific consequence on the card surface; the chain produces the per-frame text |

## Composition

- Composes with: [[rule-no-speculation-as-fact]] (each link must be sourced; unsourced links are omitted, not invented), [[rule-source-traceability-per-claim]] (the citation appears inline at the surface where the chain is rendered), [[rule-workspace-anchored-output]] (the per-vertical framing reads from the workspace profile, never from the workspace's name)
- Inherited by: every per-format writer ([[writer-regulatory-fact-document]], [[writer-technology-profile]], [[writer-operations-profile]], [[writer-market-signal-brief]], [[writer-research-summary]]), every surface frame writer ([[writer-frame-regulations]], [[writer-frame-market]], [[writer-frame-research]], [[writer-frame-operations]]), [[writer-summary-card-surface]]
- NOT inherited by: vocabulary skills, classifier skills, extractor skills (these don't emit operator-facing prose with cause-effect chains; they emit structured fields)

## What this rule is NOT

- Not a demand for five-link chains where three apply. If the workspace operates in only one vertical (or the regulation affects only one mode), the chain has fewer per-vertical lines. The discipline is "every effect link is sourced," not "every brief has five effect links."
- Not a constraint against composite causes (e.g., a SAF mandate + a carrier alliance announcement together producing a market signal). Composite causes are permitted; each component is sourced.
- Not applicable to source-discovery or classifier outputs (those don't emit prose chains). Applies at the writer/frame layer where operator-facing prose is composed.

## Failure mode signatures

- A brief section that lists facts as bullet points without naming the consequence (e.g., "EU CBAM effective 2026") with no surcharge or compliance cost named
- A "for [vertical]: [generic statement]" line that contains no source citation and no honest "requires carrier-specific data" acknowledgment
- A cause-and-consequence pair where the consequence cite is the SAME as the cause cite, suggesting the consequence was inferred from the cause without an independent source

## Audit cross-reference

- Original `environmental-policy-and-innovation` source lines 144-164 (canonical example chain at lines 156-160)
- Dispatch 2.5 prework Gap 4 (severity HIGH; the discipline that distinguishes workspace-anchored briefs from generic regulatory summaries)
- v2 audit finding: 39 of 655 items (5.9%) populate `key_data` with naked-fact arrays (no surrounding chain). This rule's enforcement closes that gap at the writer layer.
