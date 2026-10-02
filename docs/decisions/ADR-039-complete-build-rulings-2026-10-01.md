---
id: ADR-039
title: Complete-build rulings, 2026-10-01 - five sub-decisions closing the open design questions in specs 08, 09 and 06
status: accepted
date: 2026-10-01
scope:
  - "docs/plans/complete-build-plan-2026-10-01.md"
  - "docs/specs/06-gap-register-and-sequence.md"
  - "docs/specs/08-flywheel-design.md"
  - "docs/specs/09-domain-extensions.md"
  - "fsi-app/src/lib/entities/decisions.mjs"
  - "fsi-app/src/lib/market/surcharge-audit.ts"
  - "fsi-app/src/lib/market/indexation-clause.ts"
  - "fsi-app/scripts/research/oem-roadmap-intake.mjs"
supersedes: []
related:
  - "docs/plans/complete-build-plan-2026-10-01.md"
  - "docs/decisions/ADR-024-decision-propagation.md"
  - "docs/decisions/ADR-035-one-aggregate-anonymity-floor.md"
  - "docs/decisions/ADR-038-research-assessment-model.md"
---

# ADR-039: Complete-build rulings, 2026-10-01

Coordinator ruling under the operator's standing delegation (2026-10-01, verbatim): "You have built the
plan and I trust you to make the best decision for all of these issues. If items are from decisions made
a long time ago and superseded by newer items are out of scope. Remove them. I want all of these it's
fixed. Not worked around. Resolved completely."

This ADR closes every "still open" item carried in `docs/plans/complete-build-plan-2026-10-01.md` section
5 as it stood before this ruling. None of the five sub-decisions below is deferred, worked around, or
left as a further design question; each resolves to a build-ready rule with its own lane in the plan.

## (a) Pool-position inference disclosure (spec 09 section 1.2, `pool_adjusted_eur`)

**Decision: held internal. Only the statutory variance (`billed_eur` vs `statutory_eur`) is published to
the customer.** `pool_adjusted_eur` (the modelled inference of a carrier's FuelEU pooling position from
public THETIS-MRV vessel data) is computed and stored, never surfaced to any customer-facing component.

This adopts the spec author's own recommendation verbatim: holding the inference internal and publishing
only the observed-against-statutory variance is the conservative commercial choice, because the
customer-facing claim "your billed surcharge exceeds the statutory liability by EUR X" is defensible
(observed against statutory), while "your carrier is overcharging you by EUR Y" requires the modelled pool
position and is an accusation the product cannot support on inferred data. The lane building this domain
(complete-build-plan lane L22) enforces the split at the type layer: no customer-facing renderer accepts
a `pool_adjusted_eur` value as an argument, mirroring the statutory/estimate isolation pattern already
shipped in spec 08 section 4.

## (b) Indexation clause output format (spec 09 section 1.3)

**Decision: mechanics and arithmetic only, never drafted clause text.** The indexation-clause generator
(complete-build-plan lane L23) emits the index, base value and date, pass-through percentage, cap, floor,
review cadence and a worked numeric example. It never emits prose framed as contract language.

This is required by the platform's own integrity rule (CLAUDE.md "Operating Principle", the
accurate-grounding half) and by the no-legal-advice boundary the Assistant already observes (spec 00
section 7's refusal classes). Drafted clause text reads as legal advice however it is captioned; the
mechanics-only output lets the customer's own counsel draft the contract clause from numbers the product
can defend.

## (c) OEM density basis (spec 09 section 1.3, open decision 3)

**Decision: `M` (missing) when `energy_density_wh_kg` is only disclosed at cell level and no pack-level
figure exists. Never a derived pack-level estimate.** This is the spec's own recommendation, consistent
with the rest of the design's never-zero-fill, never-silently-impute discipline (spec 00 section 2, spec
04 section 3). The OEM equipment roadmap domain (spec 09 section 1.1) is no longer deferred: it is built
as complete-build-plan lane L21, with `density_basis` recorded explicitly on every row and this `M` rule
enforced as a negative test (a cell-only-disclosed row never produces a computed `Δpayload_pct`).

## (d) Confidence floors per use (spec 08 section 3.3's `FLOOR[use]`, spec 08 section 8 open question 3)

**Correction, not a new decision: the floors are already set.** ADR-024 decision 3 fixed
`FLOOR = { analysis: 0.50, calculation: 0.75, filing: 0.90 }`, live today in
`fsi-app/src/lib/entities/decisions.mjs` (confirmed by direct read this session, lines 45-48). Spec 08's
own section 8 framed this as an open question before ADR-024 landed; the specs were not updated after the
ADR shipped. `docs/plans/complete-build-plan-2026-10-01.md` section 5's row calling the floors "still
unset" is corrected in place, per rule 14's instruction that a refuted finding is corrected where it was
recorded, not silently dropped. No lane needs to set a floor; every lane calling `admissibleFor()` already
uses the live values.

## (e) Spine scope for v1 (spec 06 section 9 open question 1)

**Decision: all nine entity kinds.** The entity-kind enum (`entities.kind`, spec 08 section 1.1) already
enumerates all nine; obligation and signpost get their per-kind attribute tables in complete-build-plan
lanes L17 and L6 respectively, and the remaining four (asset, method, technology, person) get theirs in
the new lane L19, with its own acceptance test (every kind in the enum has a backing attribute table, a
fixture row inserts cleanly for each). This resolves the question operationally: nothing in the nine-kind
model is deferred or narrowed; the sequencing (obligation and signpost first, because they gate the most
other work, the remaining four in L19) is a build-order choice, not a scope reduction.

## What this ADR does not change

ADR-035 (the aggregate anonymity floor), ADR-036 (learning-loop forks) and the in-flight
`lane/w2r-research-assessment` / `lane/w2r2-assumption-register` branches (which will carry ADR-038, the
research assessment model's own ADR) are unaffected by this ADR; none of the five sub-decisions above
touches their scope.
