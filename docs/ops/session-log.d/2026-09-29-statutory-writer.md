# 2026-09-29: Lane STATUTORY-WRITER (PR #824 follow-up)

## Coordinator rulings this session

1. Push hold lifted (CI-parity merged, #822/74fc06c8): rebase onto origin/master, full pre-push, push once,
   open PR. Done: PR #824.
2. The owed real run needed a rows-file the workflow would actually reach; putting a test file at the LIVE
   default path (`fueleu-annex-iv-rows.json`) was refused (the workflow would treat it as real input
   forever). Ruling: add an opt-in `statutory_rows_file` workflow_dispatch input that only redirects when
   explicitly set, forces `--dry` regardless of the run's own mode, and prove the live path is unchanged
   when the input is absent.

## What was built

1. `fsi-app/scripts/propagation/resolve-statutory-rows-file.mjs`: the one place that resolves the
   `statutory_rows_file` override (or falls back to the unchanged live default,
   `scripts/propagation/fixtures/fueleu-annex-iv-rows.json`). Pure, $0, no I/O. 6 unit tests prove: absent/
   empty/whitespace-only input all resolve to the live default unchanged; a real override is used verbatim
   (trimmed).
2. `.github/workflows/propagation-drain.yml`: new `statutory_rows_file` input (string, default `''`,
   hand-dispatch-only per its description); `RUN_STATUTORY_ROWS_FILE`/`RUN_STATUTORY_FORCE_DRY` plumbed
   through the existing RUN_* resolution step (empty/false on every `workflow_run` chain and on the
   unrecognized-event branch, unchanged from before); the `write-statutory.mjs` step now resolves its
   `ROWS_FILE` through the new module and forces `--dry` when the override is set, regardless of `RUN_MODE`.
3. `fsi-app/scripts/propagation/fixtures/test-statutory-rows.dry.json`: the test-only fixture named in the
   ruling. Passes `validate-statutory-rows-file.mjs` structurally (real EUR-Lex Article 4(2) source block,
   no placeholder markers in `shipKey`/`citation`), but its `ghgIntensityActual` carries `originClass:
   "community"`, which `admissibleFor()` refuses for `'filing'` use, the SAME gate
   `write-statutory.test.mjs`'s own unit tests exercise with the identical value. Confirmed locally (no DB
   needed, refusal happens before any read): `writeOneRow` returns `{action:"refused-inadmissible",
   field:"ghgIntensityActual", reason:"community is never admissible..."}`. The row can never reach a
   `statutory_computations` INSERT, in either mode.

## Gates run

- `node --test resolve-statutory-rows-file.test.mjs write-statutory.test.mjs plan-quarantine-disposition.test.mjs`: 40/40 pass.
- `python3 -c "import yaml; yaml.safe_load(...)"`: workflow YAML parses clean (`actionlint` runs in CI per F52).
- Full local pre-push / CI-parity gate: see this file's own addendum below once run against the rebased branch.

## Real dispatch (owed proof)

See addendum appended after the actual `gh workflow run` dispatch and `harness_runs` SELECT.
