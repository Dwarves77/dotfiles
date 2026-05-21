---
id: ADR-006
title: Plan-skill hybrid discipline (multi-dispatch coordination)
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md"
# future_scope (will be added when first 3+ dispatch coordination authors a plan):
#   - docs/plans/
supersedes: null
related: []
---

## Context

Some work is one-shot (a single design dispatch + its implementation = 2 dispatches). Some work is coordinated (Track A + Track B + Track C parallel sweeps; Q1 through Q11 sequence; multi-phase architecture builds). The 3-axis skill audit surfaced that the `superpowers:writing-plans` and `superpowers:executing-plans` skills were treated as aspirational (no plan files existed in `docs/plans/`; major coordinations ran memory-driven via worktree naming and transcript).

Two options surfaced: require plans for all dispatches (high overhead, false signal) or skip plans entirely (loses coordination visibility for multi-dispatch work).

## Decision

Hybrid: plan files required for 3+ dispatch coordinations; memory-driven coordination acceptable for single-dispatch or 2-dispatch work.

The 9th binding rule (Plan-skill hybrid, in sprint-followups-discipline) codifies the threshold. The 10th binding rule (Verification-before-completion required) is universal regardless of dispatch size — verification is too important to scale with coordination size.

Plan files land at `fsi-app/docs/plans/<YYYY-MM-DD>-<coordination-name>.md` BEFORE the first dispatch in the coordination fires.

## Consequences

- Most dispatches are memory-driven (low overhead, no plan file).
- Multi-dispatch coordinations (3+) have a written plan up front that subsequent dispatches reference.
- Rule 009 (the engine rule that implements this discipline) checks for `Plan-file:` trailer line on commits whose branch name indicates multi-dispatch coordination (track-/phase-/wave-/etc.) OR commits self-attesting `Coordination: N dispatches` with N >= 3.
- Verification-before-completion (rule 010) is universal; even single-dispatch commits owe a `Verification:` line citing the command and observed result.

## Alternatives Considered

- **Plans for everything**: rejected. Overhead on single-dispatch work; produces empty-paperwork plans.
- **Plans for nothing**: rejected. Multi-dispatch coordinations need an enforceable shared reference; otherwise drift surfaces between dispatches.
- **Hybrid by dispatch count (chosen)**: clear threshold, mechanically checkable, low friction on single-dispatch work.

## References

- sprint-followups-discipline 9th binding rule (Plan-skill hybrid rule)
- sprint-followups-discipline 10th binding rule (Verification-before-completion required rule)
- Rule 009 engine: `fsi-app/.discipline/rules/009-plan-skill-hybrid.mjs`
- 3-axis skill audit commit: 383974e
