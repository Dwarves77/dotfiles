# Run-structure protocol — ascending cost/irreversibility tiers (2026-07-14)

Codifies the operator's run-structure ruling (2026-07-14): **effectful runs execute in ascending tiers of
cost and irreversibility; the cheapest sufficient tier runs first, and its results inform whether the next
tier is warranted.** A run never front-loads its most expensive or least reversible action.

Doctrine: `ascending-cost-irreversibility-tiers`
([doctrine-register.mjs](../../fsi-app/.discipline/governance/doctrine-register.mjs), enforcedBy
RD-31-operator-priced-spend). Related: [dispatch-discipline-protocol](./dispatch-discipline-protocol.md).

## Why this exists

The o9 re-fetch spent on a paid fetch (tier 3) for content already held (a tier-0 re-ground would have
sufficed). Front-loading the expensive tier wastes spend and burns irreversibility before the cheap tier has
had a chance to answer the question. The fix is structural: order the run by cost/irreversibility, run the
cheap tier first, and let each tier's *result* decide whether the next is needed.

## The tiers (cheapest / most-reversible first)

| Tier | Nature | Examples | Reversibility |
|---|---|---|---|
| 0 | Free, deterministic | stored re-ground (`generateBriefFromStored`), retrieval from the item's own pool, DB reads | fully (no effect) |
| 1 | Low-cost, reversible | model-only re-synthesis from held content, guarded metadata write (snapshotted) | reversible (snapshot / delete) |
| 2 | Paid, external | Browserless fetch of a genuinely-absent primary → ground | irreversible spend; content reversible |
| 3 | Paid + corpus-mutating | truncated re-collection through the diff engine, timeline mutation | irreversible spend + state |

**Rule.** Run tier 0 across the whole worklist first. Only items tier 0 could not resolve descend to tier 1,
and so on. A run does not enter tier N+1 for an item that tier N resolved.

## Halt-review between cost/irreversibility boundaries

A tier boundary that crosses a **cost or irreversibility threshold** halts for operator **spend
authorization** — the operator prices the next tier before it runs (`operator-sets-cost` / RD-31). This is
spend authority, **not** an intake human-gate (which `no-human-finish-of-intake` / RD-20 forbids): the
machine gates still decide *correctness*; the operator decides only *whether to spend*.

In practice: tier 0→1 needs no halt (free/reversible). The tier that first crosses into paid/irreversible
(here, before tier 2, and again before the corpus-mutating tier 3) halts and reports the count + per-item
reality in one message; the operator's reply authorizes the tier or parks it. (This batch's **GATE A** — the
report before truncated re-collections — is exactly this halt.)

## What this is NOT

- NOT a limit on total spend — that is `operator-sets-cost` (the price is the operator's).
- NOT an intake/promotion human-gate — correctness stays machine-decided (RD-20).
- The ORDERING half (cheapest-first) is authoring discipline carried by this doc + the funded-pass runner
  (stored-first structurally, PR #328) + the spending-without-effect tripwire; the SPEND-AUTHORIZATION half
  is enforced by RD-31. A generalized cross-run tier-ordering fitness is a future strengthening.
