## 2026-10-11, lane GATE-PUSH-1 (gatepush1-final-push-tier): the cheap CI checks run locally on a CI-triggering push

### Accomplished

- Pre-push step 0e reads the tip commit (subject and body) of each pushed ref and sets FINAL_PUSH when no skip token appears; it prints `step 0e: final push, running the final tier (eslint on N changed files, fitness runner)` or `step 0e: WIP push (skip token), final tier skipped` (also: deletion or empty push, and final-but-docs-only, both skip).
- Steps 3d and 3e now run on a final push without DISCIPLINE_PREPUSH_FULL; steps 3, 3b, 3c, 3f, 3g, 3h and 4 keep the existing opt-in guard. 3d lints only the files changed against origin/master (prints `step 3d: no lintable files changed` for none); with DISCIPLINE_PREPUSH_FULL=1 it is the whole-tree command as before. Log paths and FAIL messages are unchanged.
- New helper `fsi-app/.discipline/hooks/lib/final-push-tier.sh` (skip-token test, final-push resolution, changed-file list, ESLint over a file list).
- Tests added to `pre-push-tmpdir.test.mjs`: 12 new (real hook in a throwaway repository with stubbed gated scripts: WIP skips, final runs both, token in body, 3d fail, 3e fail, no lintable files, docs-only, deletion and empty push, source order, token matcher, and a real-ESLint attack where an unused variable fails the 3d command and a clean file passes). Red against the old hook: 8 failed, 4 passed (the attack and docs-only ones passed because they assert absence or the helper alone). Green after the hook edit: 24 of 24 across `pre-push-tmpdir.test.mjs` and `pre-push-honest-forms.test.mjs`.
- Measured: step 3d on a 3-file change 5 to 6 s; step 3e (fitness runner) 50 s, under the 180 s line.
- ADR-040 gained a dated amendment paragraph (what runs on which push, the measured times, the three CI reds that motivated it).

### Read and reused

- Read the whole `pre-push` hook, `lib/prepush-logdir.sh`, `lib/worktree-node-modules.sh` (header), both existing hook test files, rule 024's token list, `discipline.yml`'s ESLint and fitness steps, `eslint.config.mjs`. Reused: the honest-forms fixture pattern (a throwaway repository running the real tracked hook), `pre_push_log_firing`, the existing 3d and 3e bodies and messages, rule 024's skip-token list.

### Decisions

- The `skip-checks: true` trailer counts as a skip token (rule 024 and GitHub both recognise it) alongside the five listed in the brief.
- With DISCIPLINE_PREPUSH_FULL=1, 3d stays the whole-tree lint (CI parity); only the default final-tier mode is changed-files-only.
- Fail closed: a final push runs 3e whatever the lint file count.

### NOT done

- The WIP save-point pushes of this lane did not exercise the final tier by design; the single final push is the first live firing, reported in the lane report. [NOT-WORK: the final push is the live proof, recorded in the PR]
- File names containing spaces would be split by the 3d file list; no tracked fsi-app source file has one. [NOT-WORK: scope statement, no such file exists]

### Open items

- None. [NOT-WORK: nothing owed by this lane]
