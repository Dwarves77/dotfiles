# 2026-10-11, lane PIPE-1 (pipe1-one-pipeline): the PR workflows become one workflow with five jobs

## Accomplished

1. `.github/workflows/ci.yml` (workflow `CI`; push to master, pull_request to master, workflow_dispatch): five jobs whose check names equal their ids: `inputs`, `static`, `schema`, `app`, `master`. Eight workflows deleted in the same PR (discipline, bug-class-guard, build-proof, design-audit, migration-proof, rls-persona-matrix, route-and-view-attacks, gate-step-attacks). Dispatch-only and workflow_run runtimes, live-smoke.yml and chain-proof.yml are untouched.
2. `fsi-app/.discipline/governance/job-inputs.mjs` reshaped to the five-job map: the `code` verdict (the negation of docs-only-range.mjs's docs-only verdict, so the one shared primitive the pre-push hook uses now also scopes CI), the scoped entries `schema`, `app` (job level) and `master_build` (the master job's build step, `derive: false`), `ALWAYS_ON = inputs, static`, `MASTER_ONLY = master`. The in-job scope steps of migration-proof, rls-persona-matrix, route-and-view-attacks and gate-step-attacks, the `paths:` filter of build-proof, the two docs-only resolution steps of discipline.yml and three of the four `inputs` jobs are gone: one scope mechanism.
3. Shape tests rewritten against ci.yml, each attack case carried over (mapping below): `F52-workflow-file-validity.test.mjs` (the GATE-4/6/9, CI-FIX-1, CI-MIN-1 half; 76 pass), `migration-proof-workflow.test.mjs`, `route-and-view-attacks-workflow.test.mjs`, `gate-step-attacks-workflow.test.mjs`, `design-audit-workflow.test.mjs`, `workflow-mutation-attacks.test.mjs` (56 mutations of ci.yml across three suites, each suite with its control, plus the unchanged chain-proof suite), `workflow-pr-concurrency.test.mjs`, `F68-actions-artifact-budget.test.mjs`, `runner-ci-forms.test.mjs`, `pre-push-tmpdir.test.mjs`, `forbid-fires-attack.test.mjs`, `emit-workflow-run-artifact.test.mjs`, and the comment of `F9-real-project.test.mjs`. `job-inputs.test.mjs` carries the five-job map, the expected job sets and the COVERAGE attack (22 pass).
4. Runbooks `docs/runbooks/gate-evaluation.md` and `docs/runbooks/maintenance.d/68-migration-proof.md` follow ci.yml.
5. The static job's timeout is 19 minutes, from measurement (coordinator direction, 2026-10-11): the old unit-test job carried 5 and its suite takes 4.9 to 5.1 (PR 1100 run 38112370066 was cancelled at 5m0s). Steps in series, median seconds: validate-commits 25, consistency 16, discipline test suite 306, fitness job 229, HARD discrimination 38, gate-step attacks 75, about 50 of checkout, setup and uploads = 739 s = 12.3 minutes; plus 50 percent headroom = 18.5, rounded to 19. REG-1 (in flight) shrinks the suite.
6. The two session-log lines the coordinator named were given their tokens (`2026-10-10-gatefix2-bash-edits-and-paths.md:39` NOT-WORK, `2026-10-10-tests2-owed-tests-residue.md:58` CLOSED: PR 1108). The second line also quoted a `[REFUTED: ...]` instruction inside backticks, which the gate counts as a second disposition (`multiple dispositions` after the first fix); the brackets of that quoted text became plain text. `audit-finding-status --strict` now reports 0 undispositioned.

## Where the route attacks run, with the numbers

Chosen: the `schema` job, on the same stack as the migration proof and the RLS matrix. Measured (runs of 2026-10-11, 38109713063 and siblings): install 21 s, stack start 86 s, replay 27 s, build against the stack 74 s, route attack 210 s; the matrix job whole was 164 s. `app` is a container job (the Playwright image) and a container has no Docker daemon, so the stack cannot start there. Anywhere else the routes attack would pay a second stack (86 + 27 + 21 s). In `schema` it costs only its own build (74 s) and attack (210 s). `schema` is about 9.5 minutes for a routes or migrations PR against `app` at about 11 minutes, in parallel. Consequence recorded: the routes inputs (`fsi-app/src/app`, `src/lib/api`, `src/lib/auth`, `src/proxy.ts`) are inputs of `schema`, and a PR that changes a route builds the app twice (placeholders in `app`, against the stack in `schema`).

## Expected job sets (job-inputs.test.mjs, asserted)

- docs-only PR (session log, ADR): inputs, static; `code` false, so static runs validate-commits, the memory gate, the consistency backstop, the scoped-jobs report and the audit-finding-status gate only; schema and app skipped.
- migrations-only PR: inputs, static (all steps), schema; app skipped.
- components-only PR (`fsi-app/src/components/...`): inputs, static (all steps), app; schema skipped.
- routes PR (`fsi-app/src/app/api/...`): inputs, static, app and schema.
- scripts/proof PR: inputs, static, schema.
- Push to master: inputs, master (the build step only when `master_build`).
- Any workflow, `job-inputs.mjs` or its test: every job.

## COVERAGE TABLE (every job of every deleted workflow, and the shape-test cases)

| Deleted job | Now |
|---|---|
| discipline.yml `inputs` | `inputs` (one classify step, three event shapes) |
| discipline.yml `validate-commits` | `static`: Run discipline engine (pull request), Memory gate, Upload gate firings; `master`: Run discipline engine (push to master), Memory gate (push) |
| discipline.yml `test-discipline-engine` | `static`, code steps before npm ci (the no-npm semantics kept): Run discipline test suite, Test discovery, Invariant-coverage, Closure gate, Skill-contract drift, Orphan census; its docs-only step is the `code` verdict |
| discipline.yml `consistency-backstop` | `static`: Consistency runner (pull request) and the scoped-jobs report; `master`: Consistency runner (push to master) |
| discipline.yml `fitness-check` | `static`, code steps after npm ci: ESLint, fitness runner (F9 is the tsc over the whole app, so no separate tsc step), actionlint with its cache, npmtest suites, goldens; its docs-only step is the `code` verdict |
| discipline.yml `rendering-guard` | `app`: Run rendering guard (exact shape pinned by F52 RG-1, RG-2) |
| bug-class-guard.yml `inputs` | RETIRED (duplicate of `inputs`; register 2B: 13 to 16 s, not required, three more copies in discipline, design-audit, rls-persona-matrix) |
| bug-class-guard.yml `discrimination-guard` (HARD, required) | `static` HARD step (code) and `master` HARD step (push) |
| bug-class-guard.yml `bug-class-scan` (SOFT) | one step `SOFT - bug-class repo scans` in `static` (code). Kept, not retired: the four scripts it runs (inconclusive-report, type-consumer-probe, error-drop-probe, migration-number-collision) have no other workflow root, so F25 module liveness would flag them. It gates nothing (every command `|| true`; register 2B: not required). Deleting it with the four scripts is the coordinator's call |
| build-proof.yml `build-proof` | `app`: next build (placeholders); `master`: next build when `master_build` (the old `paths:` set). The `paths:` filter is RETIRED |
| design-audit.yml `inputs` | RETIRED (duplicate of `inputs`; register 2B: not required) |
| design-audit.yml `design-audit` (required, soft) | `app`: Run the design audit, job summary, dispatch commit-back, Upload, Attack the D-M4 forbid rows. Soft contract kept: reports and exits 0 whenever the audit ran; register 2B confirms it never gated |
| design-audit.yml `record-harness-run` | `app` step Land the design-audit harness-run artifact (workflow_dispatch only, the only step that names a secret). It never ran on a pull request (register 2B: skipped x5), so nothing a PR relied on was lost. `workflow_dispatch` is therefore a trigger of ci.yml; static, schema and master carry event conditions so a dispatch runs inputs and app only |
| migration-proof.yml `migration-proof` (required) | `schema`: Replay, schema catalog query, Apply every pending migration. The in-job scope step is RETIRED (the classifier scopes the job) |
| rls-persona-matrix.yml `inputs` | RETIRED (duplicate) |
| rls-persona-matrix.yml `rls-persona-matrix` | `schema`: Run the RLS persona matrix, on the shared stack (no second stack start, replay or apply) |
| route-and-view-attacks.yml `route-and-view-attacks` | `schema`: Attack the stack steps, view and function attacks, definer and count RPC attacks, build against the stack, start, Attack every route method |
| gate-step-attacks.yml `gate-step-attacks` | `static`: DS23 (the install step is the control; a second `npm ci` is RETIRED), DS24, F9 on the real app, Remove the attack files; all last |
| the duplicated stacks and containers | RETIRED: three stack starts, replays and applies (migration-proof, rls-persona-matrix, route-and-view-attacks) are one; two Playwright containers (rendering-guard, design-audit) are one |
| upload names `gate-firings-governance-validate-commits`, `gate-firings-governance-test-discipline-engine` | one file in one job: `gate-firings-governance-static` (`gate-firings-governance-master` on a push); `gate-firings-validate-commits` and `gate-firings-fitness-check` keep their names (docs/runbooks/gate-evaluation.md updated) |

Shape-test case mapping: every attack of the old F52 discipline half (VC-2, VC-3, VC-5, VC-6, VC-7, VC-8, DO-6, TR-1 to TR-4, JCOE, COE, IFF, DEL, JDEL, TRUE, RG-1, RG-2, AH6, upload retention, CI-FIX-1 rename and duplicate, CI-MIN-1 if, needs, wrong output, missing output, fixture with no inputs job) has a case in `F52-workflow-file-validity.test.mjs` against ci.yml, plus new PERM-1, PERM-2, TR-5, the classifier-call cases (DO-6 rebuilt), the no-npm-before-npm-ci ordering and the output-set case. DO-6's old subject (the two docs-only conditions in YAML) became the classifier call, because the YAML no longer holds it; the docs-only verdict itself is attacked in `docs-only-range.test.mjs` and `job-inputs.test.mjs`. The old migration-proof, route-and-view and gate-step cases map one to one onto the `schema` and `static` tests and onto the 56 mutations of `workflow-mutation-attacks.test.mjs`, with these counterparts: "no workflow_dispatch trigger" became "no schedule, workflow_run or pull_request_target, no paths filter" (ci.yml legitimately has workflow_dispatch), "exactly one job" became "the job set is the five" (F52 JDEL), "no job-level if" became "the job-level if is exactly the classifier form", and the in-job touched-step cases became "no in-job scope step" plus the new mutation that reintroduces one. The design-audit test's "image equal to discipline.yml's" became "exactly one Playwright image line in the whole workflow" (rendering guard and audit share the job).

## Read and reused

Read: CLAUDE.md, COMMON, the brief, the whole-build plan, register AUD-SYS-2B (summary and workflow rows), all eight deleted workflows in full, `job-inputs.mjs` and its test, `docs-only-range.mjs`, the local-stack action, the shape tests listed above, `closure-gate.mjs` (the family map and the live-run evidence), `execution-wiring.mjs`, `emit-workflow-run-artifact.mjs`, `lib/gate-firings.mjs`, `fitness/lib/yml-read.mjs`. Reused: the classifier (extended, not replaced), docs-only-range's primitive, the local-stack composite action, every script and step body of the eight workflows verbatim, the F52 helpers (`extractJobs`, `jobPropertyLines`, `parseNeedsIds`), the existing mutation harness.

## Decisions

- Job names equal job ids, so the five required contexts are exactly `inputs`, `static`, `schema`, `app`, `master`.
- `workflow_dispatch` is kept on ci.yml for the design-audit commit-back (DAUDIT-3) and its harness-run record (family design-audit); `app` therefore holds `contents: write` at job level on every event, as design-audit.yml did. A pull request still never commits and never names a secret.
- No separate tsc step: F9 inside the fitness runner is tsc --noEmit over the whole app.

## NOT done

- The final push and the CI run. The branch cannot go green without edits outside this lane's write set, found by running the gates on the tree (details in the report): execution-wiring.mjs reads `.github/workflows/discipline.yml` and throws ENOENT, which stops the invariant-coverage meta-gate, test-discovery and the F23 fitness function; F28 names the deleted design-audit.yml as a governing file of family design-audit. A verification copy outside the repo with the six edits applied passed invariant-coverage, test-discovery, F23, F25, F28, F50, F52, F61, F68. [WORK: owed]
- Per-job billed minutes of ci.yml's own run (needs the final push). [WORK: owed]
- Branch protection: switch the required contexts to `inputs`, `static`, `schema`, `app`, `master` before merging this PR (executor). [WORK: owed]
- Stale workflow references outside the write set: `docs/inventories/discipline.md` (lines 86, 150, 202), runbooks 64-chain-proof, layout-guard-baseline-renewal, warm-static-detail-routes, sprint4-dataops-ledger, the audit-catalogue rows, and the description of `.github/actions/local-stack/action.yml` ("shared by chain-proof.yml and migration-proof.yml"). [WORK: owed]
- The SOFT bug-class scan step and its four scripts: delete both or keep (coordinator). [WORK: owed]

## Open items

- A route PR builds the app twice (placeholders in `app`, against the stack in `schema`). Removing the second build needs Docker inside the browser container or the browser outside a container; neither is built. [NOT-WORK: scope statement, the brief let the lane choose where the routes attack runs and the numbers favour schema]
- REG-1 (in flight) shrinks the discipline suite, after which the static timeout can be lowered from measurement. [NOT-WORK: scope statement, a later lane re-measures]
