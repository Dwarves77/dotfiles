# 2026-10-04, lane S0-B (s0b-baseline-renewal-tool): a workflow that regenerates the layout-guard baseline

## Accomplished

- New `.github/workflows/layout-baseline-renewal.yml`: `workflow_dispatch` only, no schedule,
  `permissions: contents: read`, commits nothing. Setup copied from the rendering-guard job in
  `discipline.yml` (checkout@v5 fetch-depth 0, node 24, `npm install --no-save playwright@1.61.1`,
  `npx playwright install --with-deps chromium`). Runs `run-layout-guard.mjs --write-baseline` with no
  `--route` or `--width`. A verify step fails the run on any harness error, on keys/count disagreement,
  or on a count above the committed baseline's (read from HEAD). Uploads `baseline.json`, `results.json`
  and `docs/audits/layout-guard-2026-09-08.md` as one `actions/upload-artifact@v4` artifact, retention 7
  days (F68 budget).
- `layout-guard-expiry.test.mjs`: the exact `count === 792` assertion is now a ceiling (at most 792) plus
  `keys.length === count`, through a pure helper `baselineCountProblems`, with an attack test on fixtures.
- Runbook `docs/runbooks/layout-guard-baseline-renewal.md`: new "Renewal by workflow" section; states that
  a regeneration before the window start does not satisfy the gate.

## Read and reused

- Read in full: `docs/dispatches/lane-common-contract.md`, the investigation inventory,
  `layout-guard-baseline-renewal.md`, `baseline.mjs`, `run-layout-guard.mjs`, `layout-guard-expiry.test.mjs`,
  the `rendering-guard` job in `discipline.yml`, `research-walker.yml`; `baseline.json` header.
- Reused: the rendering-guard job's own setup steps and versions; the existing `--write-baseline` path in
  `run-layout-guard.mjs` (no new generator); `date-chain.yml`'s `upload-artifact@v4` shape; F68's
  retention and path rules (read, honoured).

## Decisions

- Verify step added beyond the brief's minimum because `run-layout-guard.mjs` always exits 0 (line 286),
  even with harness errors, so an unguarded artifact could be a partial baseline. It adds no new script.
- Ceiling stays 792 (the count the baseline landed with); it is a constant in the test, not read from git.

## Confirmed facts

- Old rule on fixtures: 340 keys FAIL, 792 PASS, 793 FAIL. New rule: 340 PASS, 792 PASS, 793 FAIL, and a
  fixture with `count` 792 over 340 keys FAILS. All 13 tests in the expiry file pass on the committed file.
- Mutation: with the ceiling edited to 700 in a scratch copy, 2 tests fail (the file test and the attack
  test), then the scratch copy was deleted.
- F68 `evaluateArtifactBudget`, F52 and F61 `check()` return no violations for the new workflow when run
  directly; F52 and F68 test files pass (34 and 12). actionlint is not on PATH locally; CI runs it.

## NOT done

- The workflow is not dispatched (coordinator, on or after 2026-10-08). Baseline, results, audit file and
  expiry date untouched.
- No harness_runs row: this is a tooling workflow, not a runtime family.

## Open items

- closure-gate CHECK 1 (NEVER-RUN) treats every dispatchable workflow as a target
  (`gatherNeverRunTargets`, closure-gate.mjs). This workflow has no entry in `HARNESS_FAMILY_BY_WORKFLOW`
  and no family, so a dispatch cannot produce evidence for it; after the 3 train grace it will read
  NEVER-RUN unless a registration is added (a `NEVER_RUN_ALLOWLIST` entry or an evidence path). That file
  is outside this lane's write set: NEEDS WRITE-SET EXPANSION: `fsi-app/.discipline/governance/closure-gate.mjs`
  if the coordinator wants it registered. Not red today (within grace).
- The artifact is named `layout-baseline-<run id>` and unpacks under repo-relative paths.
