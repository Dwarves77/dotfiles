# Lane WORKTREE-NODE-MODULES, 2026-09-27

## Accomplished
- Class fix for [CONFIRMED 2026-09-25] "new worktrees have no fsi-app/node_modules → pre-push reports F9/F10/F11/F12". Four lanes were hand-linked by the coordinator.
- New one-home fragment `fsi-app/.discipline/hooks/lib/worktree-node-modules.sh` (`--link | --check | --audit | --repair-all`).
  - Sourced by the tracked `post-checkout`, which links on `git worktree add` (warn-only, never wedges a checkout).
  - Sourced by `pre-push` as new step 0b, which fails fast before step 1 with `fsi-app/node_modules missing in this worktree: run sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --link`.
- Installed hooks are trampolines (D19), so the tracked edits are live on merge with no re-install.
- Test `fsi-app/.discipline/hooks/worktree-node-modules.test.mjs`: 9 end-to-end cases on throwaway repos with the real hooks, the installer trampoline and real `git worktree add/remove`. It is auto-discovered by run-test-suite.sh.

## Found while testing (rule 13: fixed, not flagged)
- [CONFIRMED] The coordinator's hand fix, a `mklink /J` junction, is destructive. `git worktree remove`, forced or not and with core.symlinks either way, empties the MAIN checkout's `fsi-app/node_modules` through it (git 2.53.0.windows.1). `rm -rf` and `fs.rmSync` are safe.
- The same class destroyed the main install on 2026-05-20. It was fixed then at the remover (`cleanup-merged-worktrees.mjs`, commit 535295c), and that script was later deleted (#459).
- Fixed now at the source. The lib creates a directory SYMLINK only, never a junction. It fails closed on Windows without symlink rights (Developer Mode), reports junctions from `--check`, `--audit` and pre-push, and converts them with `--link` / `--repair-all` (restoring the junction if conversion is refused).
- The hazard is pinned by a test, so a change in git's behaviour is noticed.

## Decisions
- No junction fallback, and no hardlink mirror. Both are workarounds: the junction is the hazard itself, and a mirror means ~minutes per worktree on a large install.
- pre-push refuses a junctioned worktree. This is a data-loss hazard, so fail closed.

## Blockers / next steps (operator)
- This machine refuses symlinks (Developer Mode off, `AllowDevelopmentWithoutDevLicense=0`). Until it is enabled, post-checkout reports instead of linking, and lanes cannot push from a fresh worktree.
- Enable Developer Mode (Settings > System > For developers), then run `sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --repair-all` from any checkout. That converts the 16 live junctioned worktrees.
- Until then, before removing any of those worktrees, run `cmd /c rmdir <wt>\fsi-app\node_modules` first.
- The symlink-removal-safety case is skipped on this machine and runs on Linux CI. The Windows-symlink behaviour of git is [HYPOTHESIS] until run once with Developer Mode on.
