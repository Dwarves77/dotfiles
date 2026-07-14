# Dispatch-discipline protocol — every constraint names its enforcement (2026-07-14)

Codifies the operator's "honest limit" ruling (2026-07-14): **every dispatch constraint that governs an
effect either names its mechanical enforcement, or is disclosed to the operator as unenforced
(trust-the-executor).** No constraint is left as silent prose that reads as enforced when it is not.

Doctrine: `constraint-names-its-enforcement`
([doctrine-register.mjs](../../fsi-app/.discipline/governance/doctrine-register.mjs)). Related:
[run-structure-protocol](./run-structure-protocol.md) ·
[RD-33 retro-apply](../audits/rd33-retro-apply-2026-07-14.md).

## Why this exists

A dispatch lists constraints ("$0 spend", "delta-only", "one paid pass per item"). Some are mechanically
enforced (a gate fails the build on violation); some rest entirely on the executor doing the right thing.
When the two are not distinguished, an unenforced constraint reads as if it were a guarantee — the operator
believes a line is protected that is only a promise. The failure class this kills: **a limit presented as
enforced when it is only trust-the-executor.**

## The protocol

For each effect-governing constraint in a dispatch (or its report), classify it into exactly one of:

1. **ENFORCED — name the mechanism.** State the rule / fitness function / invariant / gate / DB trigger that
   makes a violation *fail* (build, CI, pre-push, or a runtime throw). Example: "delta-only is enforced by
   the holdings-gate fetch seam (RD-33) — a fetch of held content throws." The named mechanism must actually
   exist and actually fail on violation; a mechanism that only warns is disclosed as partial (below).

2. **TRUST-THE-EXECUTOR — disclose as unenforced.** When no mechanism makes a violation fail, say so
   explicitly: "this line is unenforced — it rests on executor discipline." The disclosure goes to the
   operator in the dispatch report, not into a docstring. The operator then knows the line is a promise, not
   a guarantee, and can decide whether to accept the residual or ask for a mechanism.

3. **PARTIAL — name what is enforced and disclose the gap.** Common case: the mechanical half plus the
   judgment half. Example: "spend is ticketed through the chokepoint (RD-10, enforced); *choosing the
   cheapest mechanism first* is authoring discipline (unenforced)." Both halves are stated.

**Silent prose is the forbidden state.** A constraint that appears in a dispatch with neither a named
mechanism nor an unenforced-disclosure is the defect — it defaults to reading as enforced.

## What this is NOT

- NOT a demand that every constraint be mechanized. Some constraints are irreducibly process-class
  (diagnose-before-fix, retrieval-before-generation). The protocol requires *disclosure*, not enforcement.
- NOT ceremony trailers. The 2026-05-21 slim refactor retired commit-trailer attestations
  ([sprint-followups-discipline](../../fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md)). This is
  a reporting-honesty discipline, not a trailer to copy.

## Worked example (this batch)

The funded-pass STOP CONDITIONS were classified this way: `$0 default` + `lock OFF except run-scoped` +
`guarded+attributed writes` = ENFORCED (acquire-lock throw, db.mjs cite requirement, F16 signed caller);
`delta-only / nothing already held is re-fetched` = ENFORCED after PR #328 (holdings-gate seam), where before
it was trust-the-executor and the o9 re-fetch slipped exactly because it was undisclosed-unenforced;
`one paid pass per item per mechanism` = PARTIAL (spend-watch alarms on an untraceable row; the "per item per
mechanism" bookkeeping is executor discipline). The o9 incident is the cost of the silent-unenforced state
this protocol closes.
