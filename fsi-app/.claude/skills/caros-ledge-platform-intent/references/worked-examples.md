### Worked example: Phase 7 implementation dispatch

```
=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is admin chrome and operator-facing triage UI work per docs/sprint-1/phase-7-scope-amendment.md. It closes the RC-1 admin signal leak and ships the minimum viable jurisdiction triage queue. None of this work is visible to customer-facing users on Regulations, Market Intel, Research, Operations, Community, Map, the Intelligence Assistant, or Onboarding.

The customer-facing value gap on Market Intel, Research, Operations, Community expansion, and Onboarding completion is NOT closed by this dispatch. Closure is Sprint 2+ scope per caros-ledge-platform-intent SKILL.md Section "Customer-Facing Value Gap", currently unscoped.

Dual-posture: this work serves the operator role (platform layer admins) regardless of expansion. No current-vs-expansion narrowing.
```

### Worked example: Sprint 2 category routing wiring dispatch

```
=== Value Delivery Check ===

This dispatch's work DOES directly advance customer-facing value delivery.

Surface: foundation under all four intelligence pages (Regulations, Market Intel, Research, Operations). Closes REC-OBS-G by wiring the existing category-aware RPCs (get_market_intel_items, get_research_items, get_operations_items) into application code. Without this work, /market and /operations continue to share the same unfiltered payload and /research has no category filter at all.

Does NOT directly close gaps on Community, Map, Intelligence Assistant, or Onboarding; those are addressed by separate Sprint 2+ dispatches.

Dual-posture: routing wiring serves both current operational scope and expansion-time users equally; the routing applies to all sources regardless of cohort.
```

### Worked examples — the four 2026-07-17 failures and the test that catches each

- **(a) Cost/price/labor data feeds declined despite Operations = cost intelligence.** Industrial-electricity, transport-sector-wage, and bunker-fuel-price feeds were treated as "not a regulation" and dropped. The Operations line catches it: `Operations: in — per-region cost benchmark, exactly the jurisdictional cost-intelligence contract`. These are Operations feeds, not declines. (Session C's coverage lane got this right: it KEPT 27 such data-feed candidates.)
- **(b) Market Intel source discovery omitted.** A scope pass listed no candidate sources for Market Intel signals. The Market Intel line catches it: a decline/scope pass that leaves `Market Intel: <blank>` is incomplete — the contract (comparative/numerical signal discovery) was never tested.
- **(c) Research source discovery omitted.** Same shape on Research: `Research: <blank>` means the horizon-scan contract (who is studying it, maturity, assumption-shift) was never tested against the candidate.
- **(d) Clean Truck Check declined whole — the gate catching its own author.** The dispatch that ordered this gate had itself declined Clean Truck Check (CARB's heavy-duty inspection-and-maintenance program) outright. The five-surface test yields `Operations: in — recurring per-vehicle emissions-testing fee + cadence + non-compliance penalty on every heavy-duty vehicle on California lanes; a real drayage/warehousing cost`. So the correct verdict is parked-for-Operations, not a whole decline. The gate catches a mis-decline even in the dispatch that created it.
