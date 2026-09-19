# meta-harness family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`meta-harness-run-001` through `-003` retrofit MH-1, MH-2, and MH-3 respectively, the same real-evidence
retrofit discipline this family's own "screen-v1 loss" section (CONVENTION.md) applies to the three
original families, applied one layer up, to the harness that builds harnesses. A new harness family,
meta-harness and forward-events included, gets a new subdirectory and its own `family.json` (lane N2,
2026-09-19; previously, before this lane, one addition to `ALLOWED_FAMILIES` in `run-artifact.mjs`),
never a family folded into an existing one just because it seemed similar (mint and screen already
looked similar to each other before this convention existed, and that resemblance is exactly what made
the screen-v1 loss possible).

**meta-harness's standing metric** (build plan section 2's "measurement, not assertion," per family):
*proposals implemented per cycle*, of a meta-harness proposer pass's hypotheses, how many land as a diff in
the NEXT meta-harness run (retrospective, like screen's operator-overturn rate, not measurable until a
next run exists to check against; `meta-harness-run-001`..`-003` predate the family's own first proposer
pass, so it is not yet measurable for any of them, honestly recorded as such rather than defaulted to
zero), plus *gate-catch rate*: of the distinct defect classes named across ALL families' `defects_found`
history, the fraction now caught by a landed, automated, pre-coordinator-review check (a validator gate or
a fitness function) rather than only by a human/proposer reading full traces after the fact. This is a
small-N, retrospectively-computed number, not a statistically robust rate, see
`meta-harness/LAST-PROPOSER-PASS.md` for the current count and its method, recomputed at each meta-harness
run rather than asserted once and left stale.

**A named risk of self-application** (surfaced by meta-harness's own first proposer pass, Wave MH-4):
`meta-harness`'s governing files (per lane N2, 2026-09-19, `scripts/harness-runs/meta-harness/family.json`,
plus every OTHER family's own `family.json`, appended by `governing-files.mjs`'s derivation) include
`CONVENTION.md` and `PROPOSER-RUNBOOK.md`, the two documents every wave that extends the substrate is most
likely to touch. Combined with F28 rule (c)'s whole-file-hash staleness coupling (deliberately not
narrowed, see F28's own header), `meta-harness` is structurally the family MOST likely to need a new run
or a `PENDING-RUN.md` marker on any given wave, including a wave whose only change to the meta-layer is a
documentation clarification like this one. This is not treated as a defect to fix (narrowing the hash
would repeat the exact false-feeling-positive tradeoff F28's header already reasoned through and rejected),
it is named here so a future lane is not surprised by it, and so a run of unrelated documentation edits
does not get mistaken for a real proposal cycle just because it happens to be the thing that satisfies
rule (c) for a given wave.
