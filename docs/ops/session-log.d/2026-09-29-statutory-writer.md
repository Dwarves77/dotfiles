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

## Class fix: shallow-checkout rebase + artifact-branch push (PR #824 follow-up 2)

The coordinator's own dispatch of `propagation-drain.yml` (run 36534640498, mode=dry,
`statutory_rows_file` set but `backfill_and_statutory` omitted) hit "artifact commit does not rebase onto
origin/master" -- the SAME shallow-checkout rebase class #812 (gate-a-rescan) and #819 (maintenance) had
each already fixed, but only in their own workflow file. Investigation found 11 of 12 harness-family
workflows still ran a full checkout-a-branch / commit / `fetch --depth=50` / `rebase` / `push` dance
before calling `deliver-artifact-branch.sh` -- a script that (per lane HARNESS-LANDING, 2026-09-27) had
already stopped opening PRs, but still discovered its target via `git diff --name-only origin/master...HEAD`,
which needs the rebase to have succeeded first.

**Fixed for real, repo-wide:**
1. `scripts/turns/deliver-artifact-branch.sh` rewritten again: discovers this run's own artifact file(s)
   via `git status --porcelain` (untracked, since nothing is ever committed), no git history needed at
   all. Call signature simplified to one argument (a label). 5 new tests in
   `deliver-artifact-branch.test.mjs` prove: discovery, no-op, pathspec scoping, per-file failure
   isolation, multi-family runs -- all against a real scratch git repo with a stubbed
   `record-harness-run.mjs`, no DB.
2. **Full fix** (removed git add/branch/commit/rebase/push/PR entirely, single
   `deliver-artifact-branch.sh` call, `contents: read`): `propagation-drain.yml`, `change-detection.yml`,
   `downstream-chain.yml`, `fetch-drain.yml`, `source-sweep.yml`, `producers.yml`, `gate-a-rescan.yml`,
   `corpus-turn.yml` -- all 8 were committing/pushing a branch whose ENTIRE payload was the harness-run
   artifact, so the branch was pure overhead once landing became a DB write.
3. **fetch-depth: 0 only** (kept branch/push): `brief-export.yml`, `ledger-consume.yml`,
   `population-turn.yml` -- each commit step ALSO stages real deliverable content alongside the harness
   artifact (export part files, ledger candidates, the mint + forward-events snapshot dir respectively),
   so removing the branch there risks breaking a downstream consumer this lane could not verify in the
   time available. `maintenance.yml` already had `fetch-depth: 0` (lane QUARANTINE-DISPOSITION, 2026-09-28)
   and its own commit step also stages `docs/ops/dispatch-ledger.jsonl` alongside two harness families'
   artifacts, so it needed neither fix -- confirmed by F52h below, which correctly does NOT flag it.
4. **F52 (workflow-file-validity) extended** with two new checks, both with RED/GREEN fixture tests:
   - **F52g**: a job that runs `git rebase` must have `fetch-depth: 0` on its checkout step (the exact
     defect class, now mechanically unrepeatable).
   - **F52h**: no `run:` step may `git add` ONLY a `scripts/harness-runs/**` path and then `git push
     origin HEAD:` it (the removed "artifact branch" anti-pattern) -- a step that also stages other real
     content (maintenance.yml, brief-export.yml's shape) is correctly NOT flagged.
   Live-tree check: 0 violations after all fixes (was 15 before this pass: 9×F52g + 6×F52h).
5. Pending harness-run marker added for `gate-a-rescan` (its workflow file is a governing file of the
   `gate-a-rescan` family and had zero prior pending files -- F28's tree-state rule caught this).

**Residual, not fixed this pass** (documented, not silently dropped per rule 13): `brief-export.yml`,
`ledger-consume.yml`, `population-turn.yml` still push a real branch for their non-harness deliverable
content. Whether that branch is actually consumed downstream (vs. the sibling `actions/upload-artifact`
step already present in at least `brief-export.yml`) was not verified this session -- a follow-up lane
should confirm before attempting to remove those branches too.

## Real dispatch (owed proof)

See addendum appended after the actual `gh workflow run` dispatch and `harness_runs` SELECT.
