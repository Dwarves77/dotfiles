# invariants.d: one invariant, one file

Plan 6.8, Rule A (`docs/plans/complete-system-build-plan-2026-09-04.md` section 6.8, lane N5). This
directory replaces the single 1,500+-line `INVARIANTS` array literal that used to live in
`../invariants.mjs`. `invariants.mjs` now derives `INVARIANTS` by reading this directory, importing
every `*.mjs` file, validating each one, and sorting the result by id with a natural number sort
(`RD-2` before `RD-10`) so array order never depends on file order.

## The rule

- **One entry, one file.** Each file exports exactly one named export, `invariant`, holding the object
  literal exactly as it looked as an array element before the split (same keys: `id`, `skill`,
  `section`, `text`, `anchor`, and either `enforcedBy` or `exempt`, plus an optional `residual`).
- **The filename is the id.** `<ID>.mjs`. `invariants.mjs`'s loader refuses a file whose `invariant.id`
  does not equal its own filename stem, and refuses two files that claim the same id.
- **The coordinator assigns the id.** A lane that registers a new invariant does not invent its own
  numbering scheme; it takes the id the coordinator's brief names, so two lanes adding an invariant in
  the same range add two files (an honest add/add conflict only on a genuine collision), never two
  edits to one shared array.
- **Nothing else to edit.** Adding an invariant never touches `invariants.mjs`, `invariant-coverage.mjs`,
  or any other file in this directory besides the one new `<ID>.mjs`.

## Why (Cause A, plan 6.8)

Before this split, every lane that registered an invariant appended to the end of ONE shared array in
`invariants.mjs`. Two lanes appending in the same evening always conflicted on that append point, even
when the two invariants had nothing to do with each other, the "hand-edited append list" class plan
6.8 names as Cause A. A directory of one-file-per-entry turns that into an add/add of two DIFFERENT
files, which never conflicts; a true collision (two lanes independently choosing the same id) still
shows up, honestly, as a git add/add conflict on one filename, and is additionally caught before the
push by the loader's own duplicate-id refusal.

See [invariants.test.mjs](../invariants.test.mjs) for the live-load, duplicate-id, and filename-mismatch
proofs, and [../../../../docs/plans/complete-system-build-plan-2026-09-04.md](../../../../docs/plans/complete-system-build-plan-2026-09-04.md)
section 6.8 for the design this directory implements.
