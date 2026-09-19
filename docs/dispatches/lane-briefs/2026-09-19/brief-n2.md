# Lane N2: a harness family is a directory with a descriptor, never a line in three shared files (plan 6.8, Rule A)

Read first, in this order: `brief-m-common.md` (beside this file; it binds you), then on your branch
`docs/plans/complete-system-build-plan-2026-09-04.md` section 6.8, then
`docs/dispatches/lane-common-contract.md`, then `fsi-app/scripts/harness-runs/CONVENTION.md` in full.

Lane id: `n2`. Branch: `lane/n2-harness-family-descriptors-2026-09-18` (already checked out in the worktree you
are given, cut from current `origin/master`). Model: Sonnet. You execute exactly this brief. Anything it does
not cover, or any statement here that is wrong against the code, is a STOP: report it, do not solve it.

## The problem, measured

On 2026-09-18 three lanes (M8, M9b, M9a) each registered or touched a harness family and each stopped the merge
train, because registering a family means appending to the SAME spot in: `GOVERNING_FILES`
(`fsi-app/scripts/harness-runs/governing-files.mjs`), `ALLOWED_FAMILIES` (`fsi-app/scripts/lib/run-artifact.mjs`),
and two places in `CONVENTION.md` (the directory-layout block and the harness_version table, which
`F28-harness-run-integrity.test.mjs`'s `CONVENTION-TABLE-PARITY` test parses). 13 families exist today.

## What you build

1. NEW `fsi-app/scripts/harness-runs/<family>/family.json`, one per existing family (all 13), shape:
   `{ "family": "<dir name>", "registered": "YYYY-MM-DD", "registered_by": "<lane or task>", "governing_files": ["..."], "rationale": "<the comment that sits above this family's entry in governing-files.mjs today, as prose>" }`.
   `governing_files` is byte-for-byte today's array for that family, same order. `registered` comes from the
   existing comments or git history (`git log --diff-filter=A` on the family's first file); if you cannot
   establish it, STOP on that family and report, do not guess.
2. NEW `fsi-app/scripts/harness-runs/family-registry.mjs` (`node:` builtins only): reads every immediate
   subdirectory of `scripts/harness-runs/` that contains a `family.json`, validates each (family equals the
   directory name; `governing_files` a non-empty array of strings; no unknown keys; `registered` a date),
   throws a named error on an invalid descriptor, and exports a frozen `FAMILIES` array sorted by `registered`
   then `family` (deterministic, and no shared counter to collide on).
3. `governing-files.mjs`: `GOVERNING_FILES` is DERIVED from `FAMILIES` (a frozen object of frozen arrays). The
   hand-written entries and their comments go (the comments now live in each `rationale`). The runners'
   by-reference contract (`governing-files.test.mjs`, the `RUNNERS` table) must still hold unchanged.
   ONE deliberate change, state it in the file header and your report: `GOVERNING_FILES['meta-harness']`
   additionally contains every family's `scripts/harness-runs/<family>/family.json` path (sorted, appended
   after today's five files). Reason: today a registration moves the meta-harness hash because it edits
   `governing-files.mjs`; after this lane a registration edits only its own descriptor, and "the loop applies
   to itself" (CONVENTION.md) must keep holding.
4. `run-artifact.mjs`: `ALLOWED_FAMILIES` is DERIVED from `FAMILIES` (frozen array of names, same order rule).
   Before you change it, grep every importer of `ALLOWED_FAMILIES` and `GOVERNING_FILES` and check whether any
   code or test depends on the ORDER of families (for example `findFamiliesNeedingProposerPass` in
   `scripts/lib/assemble-train.mjs`). If one does, STOP and report which; do not re-order to fit.
5. `CONVENTION.md`: remove the harness_version table and every per-family enumeration a new registration would
   have to edit (the per-family lines of the directory-layout block become one generic `<family>/` entry that
   lists `family.json`, `PENDING-RUN.md`, `<family>-run-NNN.json`, optional `traces/`). Per-family prose that
   describes ONE family moves, meaning unchanged, into `fsi-app/scripts/harness-runs/<family>/FAMILY.md`.
   Moved lines count as added lines for rule 022: replace any em dash, en dash or section sign in them with a
   comma, colon or the word, and say in your report how many you replaced. Add a short section "Registering a
   family" that says: add the directory and its `family.json`; nothing else is edited.
6. Tests. NEW `fsi-app/scripts/harness-runs/family-registry.test.mjs` (the suite already globs
   `fsi-app/scripts/harness-runs/*.test.mjs`; do NOT edit `run-test-suite.sh`): valid load of the live tree;
   each refusal (name mismatch, empty list, unknown key, bad date) proven with a temp directory fixture; a
   fixture with TWO new family directories added side by side loads both (this is the 2026-09-18 collision,
   now impossible). In `F28-harness-run-integrity.test.mjs` replace `CONVENTION-TABLE-PARITY` with
   `FAMILY-DESCRIPTOR-REALITY`: every `governing_files` path of every family exists on disk. In the lane, once,
   assert equality with the past: before editing, dump today's `GOVERNING_FILES` and `ALLOWED_FAMILIES` to
   `fsi-app/scripts/tmp/n2-before.json` (gitignored scratch); after, prove the derived objects deep-equal that
   dump apart from the one deliberate meta-harness addition. Paste the comparison output.
7. Last of all, after your final edit to any meta-harness governing file, re-stamp
   `fsi-app/scripts/harness-runs/meta-harness/PENDING-RUN.md` the way the lane contract describes (one current
   `harness_version at write time:` line; the previous one reworded as superseded). Lane N3 removes this
   mechanism later; until then F28 requires it.

## Write set (exact; anything else is a STOP)

- `fsi-app/scripts/harness-runs/family-registry.mjs`, `fsi-app/scripts/harness-runs/family-registry.test.mjs` (new)
- `fsi-app/scripts/harness-runs/<each of the 13 families>/family.json` (new), `.../FAMILY.md` (new, only where prose moved)
- `fsi-app/scripts/harness-runs/governing-files.mjs`, `fsi-app/scripts/lib/run-artifact.mjs`
- `fsi-app/scripts/harness-runs/CONVENTION.md`
- `fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs` (the one test replaced; nothing else)
- `fsi-app/scripts/harness-runs/governing-files.test.mjs` ONLY if an assertion checks the literal shape you removed; say which
- `fsi-app/scripts/harness-runs/meta-harness/PENDING-RUN.md`
- `docs/ops/session-log.d/2026-09-18-n2.md` (new)

Do NOT touch `F28-harness-run-integrity.mjs` itself, any runner, any workflow, `run-test-suite.sh`, any
fitness function number or invariant id. If F45's count would rise, STOP. If it falls, re-seed the ceiling
down to the MEASURED value in the same commit and report it.

## Acceptance (paste the evidence for each in your report)

- The before/after equality proof from step 6.
- `node --test fsi-app/scripts/harness-runs/*.test.mjs fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs fsi-app/scripts/lib/run-artifact.test.mjs`: zero fail; pass counts before and after.
- `grep -n "'mint'\|\"mint\"" fsi-app/scripts/harness-runs/governing-files.mjs fsi-app/scripts/lib/run-artifact.mjs`: no hand-written family entry left (a remaining hit must be explained).
- `grep -rn "harness_version" fsi-app/scripts/harness-runs/CONVENTION.md | head`: the table is gone; the concept is still explained.
- The push gate through the wrapper, once, last, as `brief-m-common.md` says.
