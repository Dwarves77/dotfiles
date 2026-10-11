## 2026-10-11, lane HOOK-1 (hook1-three-steps): the pre-push hook keeps three steps

Yardstick class (fix-it-all plan): step A is MINIMUM SELF-MAINTENANCE (it protects the gate and the CI checkout from a false pass); step B is MINIMUM SELF-MAINTENANCE (it stops a metered CI run from finding in seconds what a machine finds first); step C is MINIMUM SELF-MAINTENANCE (code must not outrun the vault). Everything deleted from the hook serves CAPABILITY or LEARNING only through CI's static job, which already runs it.

### Accomplished

- `fsi-app/.discipline/hooks/pre-push` rewritten from 538 lines and 29 steps to three: A (tracked hook files equal HEAD, no untracked file in a critical surface; every push), B (ESLint max-warnings 0 on the changed files, then the unit tests of the changed test files and the tests beside a changed module that name it; CI-triggering push only), C (the memory gate; CI-triggering push only). Deleted from the hook: the consistency runner (2), the discipline suite (3), the invariant-coverage meta-gate (3b), the skill-gate wiring check (3c), the fitness runner (3e), the npm-dependent suites (3f), the goldens (3g), the closure and skill-contract gates (3h), tsc (4), the docs-only classifier (0c), `DISCIPLINE_PREPUSH_FULL`.
- The hook logs one line per push to `.hook-firings.log` on success too (`pre-push:push`, verdict `pass`, evidence `tier=<final|wip|none> A=ok ...`); failures keep their line, now with rule A, B or C.
- `lib/final-push-tier.sh` gained `pre_push_changed_test_files` (changed `*.test.mjs` plus the sibling and the same-directory-tree `*.test.mjs` that name a changed module) and `pre_push_run_changed_tests` (run-explicit-tests.mjs with the no-npm sandbox import, credential variables unset, FSI_NO_ENV_FILE=1: the run-test-suite.sh recipe narrowed to the files).
- Tests rewritten to the three steps with the same attack discipline: `pre-push-step-attacks.test.mjs` (11 tests: control; B lint, B tests and C each failing blocks, names the step, logs the failure, and no later step runs; all failing stops at the first; a WIP push, a deletion and an empty push run only A; A blocks on an untracked critical file and on an uncommitted hook edit, a WIP push included), `pre-push-tmpdir.test.mjs` (14 tests: the hook source keeps no deleted step, step C is CI's memory-gate command, every failure echo logs first, the pass verdict, changed-test selection and the test runner in a throwaway repository, plus the existing log-dir, stale-copy, skip-token and real-ESLint attacks), `pre-push-honest-forms.test.mjs` (3) and `worktree-node-modules.test.mjs` (13; its pre-push test now feeds a final-push ref line, because the dependency link check moved into step B).
- Red-then-green: the changed-test selection test failed first (a same-directory test importing the changed module was missed, because Git for Windows rewrote the leading-slash search argument as a path), then passed after `MSYS2_ARG_CONV_EXCL`; the test-runner test failed first on a stub escape, then passed. The old four hook test files were red against the new hook (they asserted steps 0b, 2, 3e, 4) and green after the rewrite.
- ADR-040 second amendment appended.
- Rule 17 on the merged tree (master already merged, nothing newer): eslint on the changed files, fitness runner 44 functions 0 violations, invariant-coverage meta-gate PASS, test-discovery PASS, skill-contract drift OK, all four hook test files plus the install-hooks tests green. The closure gate is red on 8 NEVER-RUN workflow rows (chain-proof, ci, data-audit-lane and others) before and after this lane; it is not touched here.

### Read and reused

- Read the whole old hook, `lib/final-push-tier.sh`, `lib/worktree-node-modules.sh` (consumer), the four hook test files, `install-hooks.mjs` (it lists hook NAMES only, not steps, so it is untouched), ADR-040, `run-test-suite.sh`, `run-explicit-tests.mjs`, `test-discovery.mjs`, `memory-gate.mjs` (header), ci.yml's static job. Reused: step 0e and its skip-token functions, the firing logger (one optional third argument), the log-directory fragment, the node:test runner wrapper and the no-npm sandbox for B, the memory-gate script for C, the existing step-attack stub fixture pattern. No importer map exists for tests, so B uses a name match, as the brief allowed.

### Decisions

- C runs on a CI-triggering push only, not on every push: the brief says a WIP push runs only A, and CI's static job runs the memory gate on the PR. Before this lane the memory gate ran on every push.
- The dependency-link self-heal and check (formerly 0b) moved inside B: only B needs a resolvable install.
- B runs `*.test.mjs` only; `*.npmtest.mjs` and `*.selftest.mjs` stay with CI (they need the install or a named runner).
- Git for Windows rewrites an argument starting with `/` as a path; the module-name search sets `MSYS2_ARG_CONV_EXCL='*'` for that one `git grep`.

### NOT done

- The brief names "refuse secrets" in step A, but the old step 1 had no secret scan and no other hook step does; none was added. [NOT-WORK: scope statement, step A is exactly today's step 1 plus 0d as the brief says]
- `docs/inventories/discipline.md` (the hook step list), `docs/dispatches/lane-common-contract.md` (the preflight text) and ADR-046 still describe the deleted steps and `DISCIPLINE_PREPUSH_FULL`; they are outside this lane's write set. [WORK: owed]
- `fsi-app/.discipline/governance/check-pretooluse-wired.mjs` (the drift check of the out-of-repo PreToolUse wiring) had its only automatic caller in the deleted step 3c and now runs nowhere automatic; F25 and the orphan census still pass because the operator-CLI register names it. Candidate home for the coordinator to rule on: `install-hooks.mjs` calling `verifyWiring` right after `applyWiring`, which needs a write-set grant for that file. [WORK: owed]
