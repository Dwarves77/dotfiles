# Git Worktrees Inventory

Catalog of current git worktrees with branch + merged-status + lifecycle state. Maintained per the Inventory-artifact emission rule + the worktree-cleanup class fix (OBS-53 + remediation-discipline Section 4 category 7).

## Status

**STUB** (created 2026-05-20).

Current worktree state per `git worktree list`: 11 worktrees (main + 6 unmerged carryover + 3 recently-merged protect-list + 1 inventory work). Last bulk-cleanup ran 2026-05-20 via `scripts/cleanup-merged-worktrees.mjs --execute` at master commit `261a751`.

## Path convention (binding)

New worktrees go under `C:/Users/jason/dotfiles/.worktrees/wt-<name>` per FaDB recognized paths. Sibling-to-repo-root convention (`dotfiles-wt-<name>`) is anti-pattern; bypasses FaDB cleanup discipline. See remediation-discipline Section 7 Example 7.

## Expected columns when populated

| Column | Source |
|---|---|
| Path | `git worktree list --porcelain` |
| Branch | Same |
| Merge state | `git merge-base --is-ancestor <branch> master` |
| Status | active / recently-merged / unmerged-carryover / protect-list |
| Created | Filesystem `Date modified` on the worktree directory |
| Cleanup eligibility | computed per `scripts/cleanup-merged-worktrees.mjs` decision rules |

## Maintenance trigger

Any dispatch that creates OR removes a worktree MUST update this inventory + emit `Inventory-emission:` line. The cleanup script itself can emit on `--execute` runs.

## Known gaps

- Step 3 of the worktree-cleanup 3-step pattern (config-registry sweep against `~/.claude/settings.json` additionalDirectories) is currently manual. Automating in `cleanup-merged-worktrees.mjs` is OBS-58 (queued for next cleanup-script touch).
