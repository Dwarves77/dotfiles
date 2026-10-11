# 2026-10-10, lane CI-MIN-1 (cimin1-jobs-scoped-to-inputs): Phase 1 of the CI minutes plan

## Accomplished

1. **One classifier**: `fsi-app/.discipline/governance/job-inputs.mjs` exports the job to input-globs map (`SCOPED`, `buildJobInputs`) and `jobsTouched(changedFiles)`, plus a CLI (`--pr-merge`, `--all`, `--github-output`, `--print-unchanged`). Scoped: rendering_guard, design_audit, migration_proof, rls_persona_matrix, discrimination_guard, bug_class_scan. Always-on and never scoped: validate-commits, consistency-backstop, test-discipline-engine, fitness-check. A script a job runs is read out of its workflow job block (and out of `npm run <name>` through package.json) and contributes its relative-import closure, so a new import inside a detector or the rendering guard becomes an input with no edit to the map. An empty or unreadable diff, a checkout that is not a merge commit, any classifier fault, a workflow file, or the classifier itself marks every job touched.
2. **Tests** `job-inputs.test.mjs` (18): (a) parameterised attack, one file per glob of every scoped job returns that job (a new entry is covered automatically); (b) coverage, every tracked non-docs file (reusing `isDocsOnlyPath`) has at least one always-on or scoped job; (c) a workflow or the classifier returns every job; derivation, CLI on a real merge commit, expected job sets.
3. **Wiring**: an `inputs` job first in discipline.yml, design-audit.yml, rls-persona-matrix.yml and bug-class-guard.yml runs the classifier over HEAD^1..HEAD of the pull request's merge commit (the pull request's effect on its base tip, never HEAD~1) and outputs one value per scoped job. rendering-guard, design-audit, rls-persona-matrix, discrimination-guard and bug-class-scan carry `needs: inputs` and a job-level `if`. design-audit and the two bug-class jobs still run on a dispatch or a push (`github.event_name != 'pull_request' || ...`). consistency-backstop prints `inputs unchanged: <job>` for each skipped wired job.
4. **F52 workflow-shape test** (`F52-workflow-file-validity.test.mjs`): the discipline.yml job set and shape expectations updated for the inputs job and the rendering-guard `if`; new tests assert every wired job in the classifier table carries `needs: inputs` and the `if` (attacks: the `if` removed, the `needs` removed, the wrong output read, the inputs output removed, a fixture workflow with none of it), the four always-on jobs never read inputs, and every setup-node step restores the npm cache.
5. **Caches**: `cache: npm` and `cache-dependency-path: fsi-app/package-lock.json` added to the eight setup-node steps that lacked them: discipline.yml (4: validate-commits, test-discipline-engine, consistency-backstop, rendering-guard), design-audit.yml, layout-baseline-renewal.yml, live-smoke.yml, migration-proof.yml. Every other setup-node step already had them.
6. **Coordinator addendum 2026-10-11** (master protection no longer requires an up-to-date branch, so a pull_request run no longer validates the exact merge result): bug-class-guard.yml restored its `push: branches: [master]` trigger that CI-MIN-0 removed; its comment states a master push run is never cancelled (the concurrency group cancels pull_request runs only). **A master push now runs: validate-commits and consistency-backstop (discipline.yml), the bug-class guard (both jobs, whatever the classifier says), and build-proof when its paths change.** Asserted by an F52 test.

## Measured (facts)

- Docker image pull inside the migration-proof "Start the local stack" step, last three runs that started a stack: run 38107850076 pull 57 s of an 87 s step; run 38105710945 pull 56 s of 87 s; run 38103016089 pull 71 s of 102 s. Not cached in this lane, as briefed.
- Expected job sets, from the classifier tests. Docs or tokens only PR (docs/ops, docs/inventories, docs/PROGRAM-BOARD): the four always-on jobs and no scoped job (rendering guard, design audit, migration proof, RLS matrix, bug-class guard all skipped). Migrations only PR: always-on plus migration_proof, rls_persona_matrix, bug_class_scan. Src only PR: always-on plus rendering_guard, design_audit, discrimination_guard, bug_class_scan. This lane's own PR touches workflows, so every job runs.
- Red-then-green: with the seven workflow files from origin/master the F52 test file fails 7 tests (the inputs job set, the discipline shape, the wired-job table, the push trigger, the cache test, the attack control); with the lane's files it passes 72.
- Before the push: eslint clean on the three touched JS files, the fitness runner 52 functions 0 violations, and 195 of 196 tests pass across job-inputs, F52, design-audit-workflow, migration-proof-workflow, chain-proof-workflow, workflow-pr-concurrency, docs-only-range (the other is a skip).

## Read and reused

Read: the brief, COMMON, the plan, ADR-047, `docs-only-range.mjs` (reused `changedFiles`, `isDocsOnlyPath`), the five PR workflows, the F52 function and test, `migration-proof-workflow.test.mjs`, `design-audit-workflow.test.mjs`. Reused: `changedFiles` and `isDocsOnlyPath`, `isMainModule`, `getRepoRoot`, the F52 file's own `extractJobs`, `jobPropertyLines`, `parseNeedsIds` and `mutate` helpers, the merge-commit diff form migration-proof.yml and rls-persona-matrix.yml already used.

## Decisions

- Each workflow gets its own `inputs` job because a job `if` can only read the same workflow's `needs`; discipline.yml's inputs job is pull_request only (its other jobs never read it).
- The outputs are produced by the CLI, so the YAML holds no list of inputs.

## NOT done

- migration-proof.yml is not wired (`wired: false` in the table). `fsi-app/scripts/proof/migration-proof-workflow.test.mjs` (outside this lane's write set) asserts "exactly one job" and "no job-level if" for that workflow, and an inputs job plus an `if` would fail it. Needs that test amended, then the job wired and the table flag flipped together (a test forces the pair). [WORK: owed]
- The in-job scope decision in migration-proof.yml and rls-persona-matrix.yml already costs about one billed minute on an untouched pull request, the same as an inputs job, so wiring them saves nothing on an untouched pull request and adds one minute on a touched one; the saving is for design audit, the rendering guard and the bug-class guard. Whether to wire migration-proof at all is the coordinator's call. [NOT-WORK: economics fact for the coordinator, no action in this lane]
- Docker image caching for the local stack. [NOT-WORK: briefed out of this lane, pull times recorded above]
- The classifier derives a job's scripts from imports only; a data file a script reads by path outside the job's listed trees is not an input unless a glob names it. The rendering guard and design audit take whole trees (`fsi-app/src`, `fsi-app/public`, `fsi-app/.discipline/rendering`) for that reason. [NOT-WORK: scope statement, fails toward running]

## Open items

- The first coordinator PR after this one is the live proof: on a docs-only PR the Actions run should show rendering-guard, design-audit, rls-persona-matrix, discrimination-guard and bug-class-scan as skipped, and consistency-backstop's log lines `inputs unchanged: ...`. [WORK: owed]
