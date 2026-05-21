# Git Worktrees Inventory

Catalog of current git worktrees with branch + merged-status + lifecycle state. Maintained per the Inventory-artifact emission rule + the worktree-cleanup class fix (OBS-53 + remediation-discipline Section 4 category 7).

## Status

**Post-cleanup state, 2026-05-21** (Layer 4 cross-skill consistency dispatch; aggressive cleanup of sibling-path worktrees executed by parallel background agents; remediation-discipline finalized after Layer 4 hotfix).

Current state per `git worktree list`: **1 worktree** (main repo only). All 11 historical sibling-path worktrees have been removed.

All other historical sibling-path worktrees (`4issues`, `ecovadis`, `masthead-uuid`, `mt-A`, `mt-B`, `mt-C`, `rebase-99`, `rebase-104`, `q4-resilience`, `phase1.5-consumers`) have been removed. Their branches survive in `.git/refs/heads/` AND are tagged for permanent recoverability (where unmerged).

## Path convention (binding)

New worktrees go under `C:/Users/jason/dotfiles/.worktrees/wt-<name>` per FaDB recognized paths. Sibling-to-repo-root convention (`dotfiles-wt-<name>`) is anti-pattern; bypasses FaDB cleanup discipline. See remediation-discipline Section 7 Example 7.

## Current worktree state

| Path | Branch | Status | Suggested disposition |
|---|---|---|---|
| `dotfiles` | `master` | Main repo | Keep |

## Preserved branches (worktree dirs removed; branches alive)

Branches removed-with-worktree (no preservation needed; branch was merged):
- `feat/q4-batch-resilience` (was at `2fc6524`; merged to master via `e082461`)
- `feat/phase1.5-completion` (was at `9a95afb`; integrated into master via Phase 1.5 commit)

Branches preserved via worktree-dir removal + `archive/*-preserve-2026-05-20` tags (unmerged work survives indefinitely):

| Branch | Archive tag | Last commit (pre-archive) |
|---|---|---|
| `fix(ui)/4-issues-wt-2026-05-12` | `archive/fix-ui-4-issues-wt-2026-05-12-preserve-2026-05-20` (parens stripped for tag-name safety) | a3ca0e9 |
| `fix/ecovadis-vendor-classification` | `archive/fix/ecovadis-vendor-classification-preserve-2026-05-20` | 2499a49 |
| `fix/regulation-masthead-uuid` | `archive/fix/regulation-masthead-uuid-preserve-2026-05-20` | 6cb203b |
| `feat/multi-tenant-A-schema-cleanup` | `archive/feat/multi-tenant-A-schema-cleanup-preserve-2026-05-20` | c98e90d |
| `feat/multi-tenant-B-invitations` | `archive/feat/multi-tenant-B-invitations-preserve-2026-05-20` | 46efacb |
| `feat/multi-tenant-C-rpc-membership-checks` | `archive/feat/multi-tenant-C-rpc-membership-checks-preserve-2026-05-20` | e39255e |
| `rebase/pr-99-on-master` | `archive/rebase/pr-99-on-master-preserve-2026-05-20` | c700768 |
| `rebase/pr-104-on-master` | `archive/rebase/pr-104-on-master-preserve-2026-05-20` | 9e88776 |

Re-attach any preserved branch later via:

```
git worktree add C:/Users/jason/dotfiles/.worktrees/wt-<name> <branch-name>
```

(Use FaDB-recognized `.worktrees/` path, not sibling-path anti-pattern.)

## Operator-pending decisions

**PR-99 and PR-104**: Agent 2's GitHub check confirmed both PRs CLOSED-without-merge on 2026-05-15. Operator decides whether to:
- Re-fire as fresh PRs (the `rebase/pr-*` branches still carry the work)
- Delete the branches (force-delete; work survives via archive tags)

**`mt-A/B/C` trilogy**: multi-tenant infrastructure work preserved via archive tags. Cleanup investigation 2026-05-21 confirmed all three already landed on master via PRs #114/#115/#116 (migrations 075/076/077 byte-identical). Archive tags + branches are redundant; operator can authorize deletion any time.

**`remediation-discipline` worktree**: REMOVED 2026-05-21 (Layer 4 hotfix dispatch). Investigation showed the 2 unmerged "sync FROM master" commits (`3b1e08a` + `6d09ecb`) were content-superseded — master had moved ahead via multiple subsequent landings (e8d03a7 + b66ae26). Branch force-deleted; worktree dir removed. Resolved.

## Maintenance trigger

Per Inventory-artifact emission rule: any dispatch that creates OR removes a worktree MUST update this inventory + emit `Inventory-emission:` line. The cleanup script (`scripts/cleanup-merged-worktrees.mjs`) can emit on `--execute` runs.

## Cleanup history

- 2026-05-20 (Layer 4 aggressive cleanup): Two parallel background agents handled this. Agent 1 removed 2 merged worktrees (`q4-resilience` + `phase1.5-consumers`) via `git worktree remove --force` after merge-ancestor verification + clean-working-tree check; `remediation-discipline` aborted (unmerged tip). Agent 2 created 8 archive tags (`archive/*-preserve-2026-05-20`) for the unmerged carryover worktrees and removed their worktree dirs; all 8 branches survive on disk. Net: 10 sibling-path worktree dirs removed, 8 branches preserved via tags + refs, 2 branches deleted post-merge (work was already on master). `remediation-discipline` is the sole residual sibling-path worktree pending operator decision.
- 2026-05-20: bulk-cleanup ran via `scripts/cleanup-merged-worktrees.mjs --execute` at master commit `261a751`. Removed 15 session-merged worktrees (q1-q8, q10, phase1-components, skill-credibility, track-a/b-code/b-doc, decisions-doc). Junction-aware fallback fix added 2026-05-20 at commit `535295c` after q5-tier-override cleanup destroyed main repo's node_modules.

## Known gaps

- **OBS-58**: Step 3 of the worktree-cleanup 3-step pattern (config-registry sweep against `~/.claude/settings.json` additionalDirectories) is currently manual. Automating in `cleanup-merged-worktrees.mjs` is queued for next cleanup-script touch.
