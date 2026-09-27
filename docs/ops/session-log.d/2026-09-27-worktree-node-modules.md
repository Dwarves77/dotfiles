# Lane WORKTREE-NODE-MODULES, 2026-09-27

## Accomplished
- **Class fix** for [CONFIRMED 2026-09-25] "new worktrees have no fsi-app/node_modules → pre-push reports F9/F10/F11/F12 or hangs". Four lanes had been hand-linked by the coordinator.
- **Final design (RD-85):** nothing is linked inside a worktree. Every worktree under `.claude/worktrees/` resolves deps from the main install through ONE gitignored link beside them, `.claude/worktrees/node_modules` (Node's parent-directory lookup).
  - It needs no Developer Mode or admin rights.
  - No remover can reach the install through a worktree.
- **One home:** `fsi-app/.discipline/hooks/lib/worktree-node-modules.sh` (`--link | --check | --audit | --repair-all`).
  - `post-checkout` creates the link on `git worktree add`.
  - pre-push step 0b SELF-HEALS (creates or replaces a missing or stale link, removes an in-worktree junction), then fails fast naming the fix only when it cannot.
- **One resolver:** `fsi-app/.discipline/lib/resolve-dep.mjs`. Five consumers hard-coded `fsi-app/node_modules` and were converted: F9's tsc lookup (now `node <typescript/bin/tsc>`, no shell), `run-npmtest-suites.sh`, rendering-guard `map-smoke.mjs` and `mounts.mjs` styleFiles, and `next.config.ts` computeAppRoot.
- **New gate:** F59 `dep-path-resolved` fails CI on a new hard-coded path. It was proven by attack against origin/master's copies of all five consumers; the first draft missed `[ -d fsi-app/node_modules ]`, the attack caught it, and it was fixed.
- RD-85 anchors to remediation-discipline category 53 (skill-ack filed). RD-79's text was corrected.

## Findings (rule 13: fixed, not flagged)
- [CONFIRMED] `git worktree remove` (forced or not, core.symlinks either way) empties the MAIN install through a junction inside a worktree (git 2.53.0.windows.1). This is the OBS-53 class (2026-05-20). It was fixed then at the remover, whose script was later deleted (#459). It is now fixed at the source.
- [CONFIRMED] In the no-in-tree-link layout, `next build` (Turbopack) refused to build until `computeAppRoot` resolved `next` via Node. After the fix it built 101/101 pages.
- [CONFIRMED] With the same throwaway worktree: `tsc` 0 errors, F10/F11/F12 PASS, 1529/1529 npm-dependent tests, goldens green. Removing it (`git worktree remove --force`, then `rm -rf` of the link) left the install intact (680 → 680 entries).
- An intermediate symlink design needed Developer Mode, and the operator rejected any build dependency on an OS setting. 16 live junctions were converted to symlinks while Developer Mode was on; those symlinks stay safe and working after it is turned off.

## Tests
- `hooks/worktree-node-modules.test.mjs`: 11 end-to-end cases on throwaway repos, using the real hooks, the real root and fsi-app .gitignore, the installer trampoline, and real `git worktree add/remove`.
- `lib/resolve-dep.test.mjs`: 3 cases.
- `F59-dep-path-resolved.test.mjs`: 4 cases.
- `F9-build-compiles.test.mjs`: updated.

## Next steps
- None required. After merge, the next `git worktree add` (or any push) creates `.claude/worktrees/node_modules` automatically.
- `--audit` shows every checkout's state at any time.
