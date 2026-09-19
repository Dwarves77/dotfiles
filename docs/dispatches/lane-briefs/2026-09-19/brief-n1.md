# Lane N1: every hand-edited registry list becomes a directory read (plan 6.8, Rule A)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper `LANE_GATE_SP=<your scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree>`,
run once, last, as one background task), then `docs/plans/complete-system-build-plan-2026-09-04.md` section
6.8 (your row is N1), then `docs/dispatches/lane-common-contract.md`.

Lane id: `n1`. Model: Sonnet. Worktree and branch are named in your dispatch. You execute exactly this
brief. Anything it does not cover, or any statement here that is wrong against the code, is a STOP: report
it, do not solve it. You never allocate a shared id. You never edit the F45 ceiling line
(`DUPLICATED_LINES_CEILING`); if the F45 test reports the measured count differs from the ceiling after your
change, STOP before the gate and report both numbers.

## The problem, measured [CONFIRMED by the coordinator's survey, 2026-09-19]

Four lists are appended by hand at one spot, so two lanes registering anything conflict there:

- `fsi-app/.discipline/fitness/manifest.mjs`: 44 `import { fitnessFunction as F<N> } from './functions/F<N>-*.mjs'`
  lines (lines 5 to 246) and the `fitnessFunctions` array (248 to 293); `getFunctionById` at 295. Every
  function file already exports `fitnessFunction = { id, name, description, source, enumerate(), check() }`.
  `runner.mjs` imports only `fitnessFunctions` (line 17).
- `fsi-app/.discipline/run-test-suite.sh`: the `node --test` block (lines 56 to 171) mixes directory globs
  with 43 explicit file names. Its header (19 to 51) says why `scripts/lib` and `src/lib/sources` are named
  lists: some tests there transitively reach npm packages (`pg`, `jiti`, `@supabase/supabase-js`) and must
  stay out of the no-npm CI job.
- `.github/workflows/discipline.yml`, step "App unit tests requiring npm deps" (lines 337 to 395): a named
  list of 14 files (380 to 393) joined at runtime with the glob `git ls-files 'fsi-app/src/**/*.npmtest.mjs'`.
- `fsi-app/scripts/verify/run-data-audit-lane.mjs`: `AUDITS` (lines 58 to 169), 34 entries shaped
  `["label", "scripts/verify/x.mjs", hard]`.

Two readers depend on these lists' SHAPE and must keep working: `fsi-app/.discipline/glob-portability.test.mjs`
reads the test list out of `run-test-suite.sh` (function `testGlobFromSuite`, lines 20 to 30) and
`fsi-app/.discipline/governance/execution-wiring.mjs` derives its seven execution surfaces by reading each
runner (lines 11 to 27; the AUDITS surface reads the array).

## What you build

1. **Fitness manifest derived from the directory.** `manifest.mjs` lists `functions/F*.mjs` (excluding
   `*.test.mjs`), imports each with `await import()`, sorts by numeric id, and exports the same
   `fitnessFunctions` array and `getFunctionById`. Validation at load: every module exports `fitnessFunction`
   with `id` matching its filename prefix (`F<N>-`), and ids are unique; a bad file throws a named error
   naming the file. The explanatory comment above each import (the history of why a function exists) moves
   into that function file's own header where it is not already there, meaning unchanged, dash glyphs
   replaced per rule 022 (count the replacements in your report). Every importer of `fitnessFunctions` or
   `getFunctionById` (grep the tree) must still work: top-level `await` is legal in `.mjs`; if an importer is
   CommonJS or a `.sh` that parses the manifest text, STOP and report it.
2. **The test suite globs, and the npm-dependent tests carry the name that says so.** The repo already has
   the `*.npmtest.mjs` convention. Rename, with `git mv`, exactly the files the workflow's named list names
   under `fsi-app/scripts/lib`, `fsi-app/src/lib/sources` and `fsi-app/.discipline/rendering/layout-guard`
   (nine files: `batch-primitives.test.mjs`, `pg-conn.test.mjs`, `decision-anchors.selftest.mjs`,
   `drift-check.selftest.mjs`, `exclusion-audit.selftest.mjs`, `inconclusive-probe.selftest.mjs`,
   `surface-registry.selftest.mjs`, `reconcile.selftest.mjs`, `layout-guard.test.mjs`) to the same name with
   `.npmtest.mjs` in place of `.test.mjs` or `.selftest.mjs`. Then `run-test-suite.sh`'s named entries for
   `scripts/lib` and `src/lib/sources` become directory globs (`fsi-app/scripts/lib/*.test.mjs`,
   `fsi-app/src/lib/sources/*.selftest.mjs`, and so on for every other named file: every explicit filename
   in the block becomes covered by a glob of its directory, or STOP and report the file that cannot be),
   and the header paragraph that explains the named lists is rewritten to explain the rename convention.
   `discipline.yml`'s named list (lines 380 to 393) is deleted and its glob widened to
   `git ls-files 'fsi-app/**/*.npmtest.mjs'`; the five `*.npmtest.mjs` files under `scripts` already named
   there are then covered by the glob. Every citation of a renamed file anywhere in the tree (`grep -rn` the
   old basename across `fsi-app/.discipline`, `fsi-app/scripts`, `docs`; `invariants.mjs` `enforcedBy`
   entries cite `selftest:` paths) is updated to the new name in the same commit.
3. **Each audit declares itself.** Every script named in `AUDITS` gains one header line, first non-shebang
   comment of the file: `// data-audit: label=<label> hard=<true|false>` (values byte-for-byte from today's
   array). `run-data-audit-lane.mjs` derives `AUDITS` by scanning `scripts/verify/*.mjs` for that line,
   sorted by label; the array literal is deleted. `execution-wiring.mjs`'s AUDITS surface reader is changed to
   read the same markers (or to import the derived list), nothing else in that file.
4. **Equality with the past, asserted once.** Before editing, dump to `fsi-app/scripts/tmp/n1-before.json`
   (gitignored scratch): the fitness ids in order, the expanded test list from `run-test-suite.sh` (use
   `testGlobFromSuite` from glob-portability.test.mjs, or the same shell expansion), the workflow's npm list
   plus glob expansion, and `AUDITS`. After, prove: same fitness ids; the same test files (modulo the nine
   renames, mapped by name); the same npm set (modulo the renames); `AUDITS` deep-equal. Paste the comparison.
5. **Tests.** `manifest.test.mjs` (new, beside the manifest, in the `.discipline/fitness/*.test.mjs` glob if
   one exists, else STOP and say which glob covers it): the live load, the duplicate-id refusal and the
   id/filename-mismatch refusal with temp fixtures. `run-data-audit-lane.test.mjs`: extend the existing test
   file if there is one (grep), else new: the derived list equals a fixture directory's markers; a script
   with a malformed marker is refused by name.

## Write set (exact; anything else is a STOP)

- `fsi-app/.discipline/fitness/manifest.mjs`, `fsi-app/.discipline/fitness/manifest.test.mjs` (new), the
  function files that receive a moved comment (header comment only).
- `fsi-app/.discipline/run-test-suite.sh`, `.github/workflows/discipline.yml` (that one step only).
- The nine renamed test files (rename only, content untouched), and every file that cites one of them by
  its old name.
- `fsi-app/scripts/verify/run-data-audit-lane.mjs` (+ its test), the 34 audit scripts (one header line each),
  `fsi-app/.discipline/governance/execution-wiring.mjs` (the AUDITS surface reader only).
- `docs/ops/session-log.d/2026-09-19-n1.md` (new; heading `## 2026-09-19, lane N1: <one line>`; ends with
  `### UX compliance (N1)`: Not a UI change; no customer surface touched by this branch.)

No new fitness function, no invariant id, no migration, no skill edit, no ceiling edit.

## Acceptance (paste the evidence for each)

- The equality proof from step 4.
- `node --test fsi-app/.discipline/fitness/manifest.test.mjs fsi-app/.discipline/glob-portability.test.mjs fsi-app/.discipline/governance/execution-wiring.test.mjs`: all pass.
- `node fsi-app/.discipline/fitness/runner.mjs 2>&1 | tail -3`: 44 functions, 0 violations.
- `grep -c "fitnessFunction as F" fsi-app/.discipline/fitness/manifest.mjs`: 0.
- `grep -n "named=" .github/workflows/discipline.yml`: no named test list left in that step.
- `bash fsi-app/.discipline/run-test-suite.sh 2>&1 | grep -E "^# (tests|pass|fail)"` once, before the gate: 0 fail.
- The push gate through the wrapper, once, last.

Residual, stated for the record: glob-portability is static; a globbed test that reaches npm only through a
dynamic import is caught by CI's no-npm job, the oracle this repo already names for that class.
