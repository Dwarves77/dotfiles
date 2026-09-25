---
id: ADR-035
title: One aggregate anonymity floor
status: accepted
date: 2026-09-25
scope:
  - "docs/specs/07-page-walkthrough.md (Community benchmark)"
  - "fsi-app/src/app/community/"
supersedes: []
related:
  - ADR-034
  - "docs/specs/07-page-walkthrough.md"
---

# ADR-035: One aggregate anonymity floor

## Context

ADR-034 (domain-agnostic core, freight forwarding first) established the core as industry-agnostic and opened the question of aggregate visibility across domains. Spec 07 (Community benchmark) defines: "Aggregated, historical, ≥5 contributors, no contributor >25%". 

The operator ruled on two candidate thresholds for aggregate visibility: ADR-034 Open Item 1 noted N≥10 profiles in an example; spec 07 stated ≥5 contributors with the same 25% cap. Two different numbers on the same product surface created ambiguity about which threshold governs population and Community benchmarks.

## Decision

Operator, 2026-09-25, chosen from offered options: **"One rule: ≥10 + ≤25%".**

A single k-anonymity floor governs every aggregate shown anywhere in the product (Community benchmarks and the population / "on behalf of many" view alike): at least 10 distinct contributing organisations AND no single contributor above 25% of the aggregate.

The Community benchmark tightens from ≥5 to ≥10 contributors.

## Consequences

- Spec 07 line 374 updates: ≥5 → ≥10.
- Community benchmark code changes to enforce the new floor.
- Any aggregate below the floor (N < 10 or any single contributor >25%) renders an absence state, not a number.
- Population view applies the same floor.
- ADR-034 Open Item 1 (thresholds bullet) is resolved.
