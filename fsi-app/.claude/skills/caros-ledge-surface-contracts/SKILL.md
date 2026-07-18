---
name: caros-ledge-surface-contracts
description: The five Caro's Ledge customer-surface contracts and the every-decline-names-the-five-contracts rule. Load this on ANY scope, coverage, source-inclusion, or feature-inclusion question about Caro's Ledge — deciding whether to include, decline, or park a source, data feed, instrument, or feature. It forces the decision to be tested against all five surfaces (Regulations, Operations, Market Intel, Research, Community) instead of one, so a candidate that fails one surface is not dropped whole when another surface would carry it. Loads alongside caros-ledge-platform-intent and environmental-policy-and-innovation.
when_to_load:
  - "Any scope decision on Caro's Ledge: include / decline / park a source, data feed, instrument, or feature"
  - "Any coverage-gap or source-inclusion question (should we cover X? is Y worth acquiring?)"
  - "Any feature-inclusion question (does this belong on the platform, and where?)"
  - "Reviewing or authoring a decline/park verdict on a coverage candidate"
  - "Borderline: default to load and record the five-surface test"
---

# Caro's Ledge Surface Contracts

## Why this skill exists

Scope verdicts — decisions to **decline** or **park** a candidate source, data feed, instrument, or feature — failed three times in one week (2026-07-17) by testing the candidate against ONE customer surface and dropping it whole when it failed that surface. A candidate that fails the Regulations contract can still be an Operations cost feed; declining it against Regulations alone silently loses that value.

**The rule: every scope decision that declines or parks a candidate MUST record a five-surface test — a verdict and a one-line reason for EACH of the five surface contracts — before the decision stands.** A decline that reasons against one surface and never names the other four is the failure class this kills.

Enforcement (Caro's Ledge repo): doctrine `every-decline-names-the-five-contracts` → invariant `PI-5` → the golden `scripts/verify/surface-contract-gate.golden.mjs` (fixture proof) plus a live CHECK constraint on `coverage_gap_candidates` (a declined/parked row without the five-surface record fails the write). This standalone skill is the portable, operator-side copy of the same content that lives in `caros-ledge-platform-intent`.

## The five contracts (what each surface would DO with the candidate)

- **Regulations** — a compliance-action text brief: what is binding, when, what it costs, what to do. Not comparative/numerical.
- **Operations** — structured jurisdictional cost / feasibility intelligence: per-region cost, labor, materials, infrastructure, and feasibility for hire-vs-automate and lane decisions.
- **Market Intel** — comparative and numerical signal: deltas, trajectories, lead-time against competitors and adjacent industries.
- **Research** — a structured horizon assessment: horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift.
- **Community** — human-operated peer surface, OUTSIDE machine intake by construction. A candidate never "routes to Community" as machine content; Community's verdict is essentially always out-for-machine-intake, recorded so the reasoning is explicit, not skipped.

Verdict vocabulary (recommended): `in` (this surface should carry it) / `out` (no fit) / `route` (belongs to this surface's sourcing program — hand it over) / `revisit` (conditional — names the condition, e.g. "check corpus coverage first"). The gate forces the DECISION to be recorded for all five; it does not constrain the verdict's shape beyond a non-empty verdict + reason.

## Inline test format (fill this on ANY decline/park verdict)

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

## Worked examples — the four 2026-07-17 failures and the test that catches each

- **(a) Cost/price/labor data feeds declined despite Operations = cost intelligence.** Industrial-electricity, transport-sector-wage, and bunker-fuel-price feeds were treated as "not a regulation" and dropped. The Operations line catches it: `Operations: in — per-region cost benchmark, exactly the jurisdictional cost-intelligence contract`. These are Operations feeds, not declines. (The coverage-discovery lane got this right: it KEPT 27 such data-feed candidates.)
- **(b) Market Intel source discovery omitted.** A scope pass listed no candidate sources for Market Intel signals. The Market Intel line catches it: a decline/scope pass that leaves `Market Intel: <blank>` is incomplete — the contract (comparative/numerical signal discovery) was never tested.
- **(c) Research source discovery omitted.** Same shape on Research: `Research: <blank>` means the horizon-scan contract (who is studying it, maturity, assumption-shift) was never tested against the candidate.
- **(d) Clean Truck Check declined whole — the gate catching its own author.** The dispatch that ordered this gate had itself declined Clean Truck Check (CARB's heavy-duty inspection-and-maintenance program) outright. The five-surface test yields `Operations: in — recurring per-vehicle emissions-testing fee + cadence + non-compliance penalty on every heavy-duty vehicle on California lanes; a real drayage/warehousing cost`. So the correct verdict is parked-for-Operations, not a whole decline. The gate catches a mis-decline even in the dispatch that created it.

## The one rule to remember

No candidate is declined against one surface. Name all five, record a verdict + a reason for each, and if any surface says `in` or `route`, it is a hand-off (park), not a decline.
