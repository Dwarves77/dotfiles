---
name: caros-ledge-platform-intent
description: Caro's Ledge platform value proposition, the binding five-surface customer-facing model, and the customer-facing value-delivery discipline. The platform is a sustainability intelligence SaaS with a domain-agnostic core, profiled by industry, role, and organisation size (per ADR-034), with two coupled value halves: intelligence (four pages: Regulations, Market Intel, Research, Operations, mapped to the source-category taxonomy in environmental-policy-and-innovation) and community (one surface: Community, co-equal with the four pages, addressing the industry information-isolation problem). Cross-cutting capabilities include Map (geographic view of Regulations content) and Intelligence Assistant (research helper grounded in platform skills and content, NOT a synthesis or decision engine). Freight forwarding is the first industry pack (current scope: art logistics, live events, luxury goods, automotive, humanitarian; expansion: broader freight forwarding across air, road, ocean, rail); additional industry packs and a public-body "on behalf of many" aggregate mode are future, separately-ruled directions. Every dispatch on Caro's Ledge build sequencing, design, audit, or implementation MUST emit the structured Value Delivery Check section listing the five surfaces explicitly. Loads alongside environmental-policy-and-innovation, sprint-followups-discipline, frontend-design.
when_to_load:
  - "Any Caro's Ledge build sequencing dispatch (sprint planning, phase scoping, build allocation)"
  - "Any Caro's Ledge design dispatch (phase design, feature design, surface design)"
  - "Any Caro's Ledge audit dispatch (alignment audit, sweep, code review of customer-facing surfaces)"
  - "Any Caro's Ledge implementation dispatch (phase build, feature build, schema work)"
  - "Any dispatch touching the five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community) or cross-cutting capabilities (Map, Intelligence Assistant)"
  - "Borderline cases: default to load and emit the Value Delivery Check section"
---

# Caro's Ledge Platform Intent

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/intent-and-value-proposition.md`: why the skill has its current form, the operator-stated corrections of 2026-05-24, the platform value proposition
- `references/five-surfaces.md`: the full per-surface contracts: Regulations, Market Intel, Research, Operations, Community; read when building or changing a surface
- `references/cross-cutting-tenancy-and-value-gap.md`: Dashboard, Intelligence Assistant, Map, Onboarding, three-layer tenant model, Sprint 1 scope, customer-facing value gap
- `references/worked-examples.md`: Value Delivery Check worked examples and the four 2026-07-17 scope-test failures
- `references/authority-anti-patterns-integration.md`: authority grant, anti-patterns, integration with other skills

BINDING: references/intent-and-value-proposition.md, read before scoping, auditing or sequencing any build (section: Why this skill exists in its current form)
BINDING: references/five-surfaces.md, read before building or changing the Regulations surface (section: REGULATIONS)
BINDING: references/five-surfaces.md, read before building or changing the Market Intel surface (section: MARKET INTEL)
BINDING: references/five-surfaces.md, read before building or changing the Research surface (section: RESEARCH)
BINDING: references/authority-anti-patterns-integration.md, read before choosing which skills load with this one (section: Integration With Other Skills)

## When This Skill Applies

Apply this skill on:

- All design dispatches and implementation dispatches on Caro's Ledge build work
- All sprint planning or sequencing dispatches
- All audits (system audit, page audit, value audit, alignment audit, chrome audit)
- Any work that proposes to change phase or sprint order
- Any work touching customer-facing surfaces (the five surfaces, plus Map, Intelligence Assistant, Onboarding)
- Any work proposing to modify this skill's framing (such work requires the operator's explicit authorization with strong-emphasis correction; see Section 10)

Do NOT trigger on:

- Pure investigation or research dispatches with no build surface
- Hotfix dispatches addressing a specific incident
- Dispatches strictly bounded to a single non-sprint workstream (e.g. fixing a typo)

When in doubt, apply the skill. Emitting the Value Delivery Check section on a small dispatch costs one paragraph; missing it on a sprint-level dispatch costs multi-week customer-facing schedule slip going unsurfaced.

## What You Must Do (Active Discipline)

At the start of every relevant dispatch, before drafting the work product:

1. **Read this skill in full.** Skill content evolves; do not rely on memory.
2. **Identify the work's nature.** Does the dispatch's deliverable directly advance customer-facing value delivery on any of the five surfaces (Regulations, Market Intel, Research, Operations, Community) or on the cross-cutting capabilities (Map, Intelligence Assistant, Onboarding), or does it advance infrastructure, foundations, or chrome (schema, ingest, classifier, admin tools, triage)?
3. **State the nature explicitly in the dispatch report.** If infrastructure, name the work as infrastructure, state that it does NOT directly close the customer-facing value gap, and identify which sprint or phase IS responsible.
4. **Surface sequence changes.** If the dispatch proposes changing build sequence, state whether the change pushes customer-facing value delivery further out or brings it closer. If further out, surface for operator decision; do not silently absorb the delay.
5. **Emit the Value Delivery Check section** in every dispatch report (format below).
6. **Surface narrowing decisions.** Flag if the dispatch serves only current operational verticals without expansion-time users, or only expansion-time users without current cohort grounding.

### Value Delivery Check section format

Every dispatch report invoking this skill MUST include a section formatted exactly as:

```
=== Value Delivery Check ===

This dispatch's work [does / does not] directly advance customer-facing value delivery.

[If does not: identify which sprint or phase IS responsible for that closure, and whether the work pushes customer-facing value delivery further out.]

[If does: identify which surface (Regulations / Market Intel / Research / Operations / Community / Map / Intelligence Assistant / Onboarding) and what specific gap it closes.]

[Optional one line: dual-posture check confirming the work serves both current operational scope AND expansion-time users, OR a narrowing flag if it serves only one.]
```

This format applies to ALL dispatch reports invoking this skill, including infrastructure-only dispatches (which emit the section briefly to confirm awareness). The section is not optional. A dispatch report missing the section is incomplete. A dispatch report whose Value Delivery Check omits Community from the surface enumeration is in violation; surface for operator correction.

## The Five-Surface Scope Test (every decline names the five contracts)

Scope verdicts — decisions to DECLINE or PARK a candidate source, data feed, or instrument — failed three times in one week (2026-07-17) by testing the candidate against ONE surface and dropping it whole when it failed that surface. A candidate that fails the Regulations contract can still be an Operations cost feed; declining it against Regulations alone silently loses that value. This section makes the five-surface test a mechanical, universally-loaded step.

**Every scope decision that declines or parks a candidate MUST record a five-surface test (PI-5)** — a verdict and a one-line reason for EACH of the five surface contracts — before the decision stands. Doctrine register: `every-decline-names-the-five-contracts`. The live gate is the CHECK constraint on `coverage_gap_candidates` (a declined/parked row without the record fails the write); the fixture proof is `scripts/verify/surface-contract-gate.golden.mjs`.

### The five contracts (verbatim — what each surface would DO with the candidate)

- **Regulations** — a compliance-action text brief: what is binding, when, what it costs, what to do. Not comparative/numerical.
- **Operations**: structured jurisdictional cost / feasibility intelligence: per-region cost, labor, materials, infrastructure, feasibility evidence for the reader's own decisions and lane decisions.
- **Market Intel** — comparative and numerical signal: deltas, trajectories, lead-time against competitors and adjacent industries.
- **Research** — a structured horizon assessment: horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift.
- **Community** — human-operated peer surface, OUTSIDE machine intake by construction. A candidate never "routes to Community" as machine content; Community's verdict is essentially always out-for-machine-intake, recorded so the reasoning is explicit, not skipped.

Verdict vocabulary (recommended): `in` (this surface should carry it) / `out` (no fit) / `route` (belongs to this surface's sourcing program, hand it over) / `revisit` (conditional — names the condition, e.g. "check corpus coverage first"). The gate forces the DECISION to be recorded for all five; it does not constrain the verdict's shape beyond a non-empty verdict + reason.

### Inline test format (fill this on ANY decline/park verdict)

```
=== Surface-Contract Scope Test ===
Candidate: <name>          Disposition: declined | parked
- Regulations:  <in|out|route|revisit> — <one line: what Regulations would do with it, or why nothing>
- Operations:   <in|out|route|revisit> — <one line>
- Market Intel: <in|out|route|revisit> — <one line>
- Research:     <in|out|route|revisit> — <one line>
- Community:    <in|out|route|revisit> — <one line>
```

If any surface's verdict is `in` or `route`, the candidate is NOT a clean decline — it is a hand-off to that surface, recorded as `parked` (routed) rather than `declined`.

## Skill Load Confirmation

When this skill loads on a dispatch, the agent's pre-work report states:

- That this skill loaded (and its commit identifier if known)
- The dispatch's nature (infrastructure / customer-facing build / mixed / planning / audit)
- The Value Delivery Check section preview (the dispatch may refine the section in the final report; the preview confirms the skill is applied AND that all five surfaces plus the cross-cutting capabilities are correctly enumerated)

If any of these cannot be stated cleanly, HALT and surface the ambiguity to the operator before proceeding.

If the preview's surface enumeration omits Community or treats Intelligence Assistant as a synthesis layer, that is a skill-load failure; the agent must re-read this skill before proceeding.
