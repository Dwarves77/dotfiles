# Git Worktrees Inventory

Catalog of current git worktrees with branch + merged-status + lifecycle state. Maintained per the worktree-cleanup class fix (OBS-53 + remediation-discipline Section 4 category 7); C4 consistency check (rule 014) enforces drift.

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
| `wt-build-7` | `feat/build-7` | Parallel Build 7 sibling dispatch | Keep until Build 7 lands or is archived |
| `wt-build-9` | `feat/build-9` | Parallel Build 9 sibling dispatch | Keep until Build 9 lands or is archived |
| `wt-build-10` | `feat/build-10` | Parallel Build 10 sibling dispatch | Keep until Build 10 lands or is archived |
| `wt-linkedin` | `feat/linkedin-import` | LinkedIn OAuth onboarding import dispatch (this entry's commit) | Remove after PR merge per FaDB Step 6 |

## Preserved branches (worktree dirs removed; branches alive)

Branches removed-with-worktree (no preservation needed; branch was merged):
- `feat/q4-batch-resilience` (was at `2fc6524`; merged to master via `e082461`)
- `feat/phase1.5-completion` (was at `9a95afb`; integrated into master via Phase 1.5 commit)

Work preserved via `archive/*-preserve-2026-05-20` tags (8 tags). Branches were force-deleted 2026-05-21 after the cleanup investigation confirmed all 8 are content-redundant on master (mt-A/B/C re-landed as PRs #114/115/116; PR-99 as #112; PR-104 as #113; small fix branches were either superseded or stale). Tags survive indefinitely as belt-and-suspenders historical reference.

| Original branch (deleted 2026-05-21) | Archive tag | Last commit | Investigation finding |
|---|---|---|---|
| `fix(ui)/4-issues-wt-2026-05-12` | `archive/fix-ui-4-issues-wt-2026-05-12-preserve-2026-05-20` | a3ca0e9 | Possibly superseded by Build 4 routing |
| `fix/ecovadis-vendor-classification` | `archive/fix/ecovadis-vendor-classification-preserve-2026-05-20` | 2499a49 | Small data fix; verify current sources table state if reapplying |
| `fix/regulation-masthead-uuid` | `archive/fix/regulation-masthead-uuid-preserve-2026-05-20` | 6cb203b | Small UI fix; verify regulation detail masthead if reapplying |
| `feat/multi-tenant-A-schema-cleanup` | `archive/feat/multi-tenant-A-schema-cleanup-preserve-2026-05-20` | c98e90d | LANDED on master via PR #114 (commit 4a67c7d); migration 075 byte-identical |
| `feat/multi-tenant-B-invitations` | `archive/feat/multi-tenant-B-invitations-preserve-2026-05-20` | 46efacb | LANDED on master via PR #115 (commit 93af8cc); migration 076 byte-identical |
| `feat/multi-tenant-C-rpc-membership-checks` | `archive/feat/multi-tenant-C-rpc-membership-checks-preserve-2026-05-20` | e39255e | LANDED on master via PR #116 (commit 685f5b9); migration 077 byte-identical |
| `rebase/pr-99-on-master` | `archive/rebase/pr-99-on-master-preserve-2026-05-20` | c700768 | RE-LANDED as PR #112 (commit 0905aad); migration 069 byte-identical |
| `rebase/pr-104-on-master` | `archive/rebase/pr-104-on-master-preserve-2026-05-20` | 9e88776 | RE-LANDED as PR #113 (commit 2846dc5); migration 073 byte-identical |

Re-attach an archive-tagged snapshot later via:

```
git worktree add C:/Users/jason/dotfiles/.worktrees/wt-<name> archive/<tag-name>
```

(Use FaDB-recognized `.worktrees/` path, not sibling-path anti-pattern.)

## Resolved decisions (2026-05-21 cleanup batch)

All operator-pending decisions on archived branches have been resolved:

- **PR-99 (rebase/pr-99-on-master)**: branch force-deleted; archive tag preserved. Investigation found PR re-landed as PR #112 on master.
- **PR-104 (rebase/pr-104-on-master)**: branch force-deleted; archive tag preserved. Investigation found PR re-landed as PR #113 on master.
- **mt-A/B/C trilogy**: all three branches force-deleted; archive tags preserved. Investigation found all three landed on master via PRs #114/#115/#116 (migrations 075/076/077 byte-identical).
- **remediation-discipline worktree**: REMOVED 2026-05-21 (Layer 4 hotfix dispatch). The 2 unmerged "sync FROM master" commits were content-superseded by e8d03a7 + b66ae26. Branch deleted; worktree dir removed.
- **3 small-fix branches** (4issues, ecovadis, masthead-uuid): force-deleted; archive tags preserved. Cherry-pick from archive tag if any of the fixes still applies to current master.

## Maintenance trigger

Any dispatch that creates or removes a worktree MUST update this inventory. C4 consistency check (rule 014) enforces drift on push.

## Cleanup history

- 2026-05-21 (Cleanup batch authorized by operator after investigation): force-deleted 5 redundant branches (rebase/pr-99-on-master, rebase/pr-104-on-master, feat/multi-tenant-A-schema-cleanup, feat/multi-tenant-B-invitations, feat/multi-tenant-C-rpc-membership-checks). All confirmed content-redundant on master via cleanup investigation. Archive tags retained as belt-and-suspenders historical reference.
- 2026-05-21 (Layer 4 hotfix): removed `dotfiles-wt-remediation-discipline` worktree dir + force-deleted `feat/remediation-discipline-skill` branch. Investigation showed the 2 unmerged "sync FROM master" commits were content-superseded.
- 2026-05-20 (Layer 4 aggressive cleanup): Two parallel background agents handled this. Agent 1 removed 2 merged worktrees (`q4-resilience` + `phase1.5-consumers`) via `git worktree remove --force` after merge-ancestor verification + clean-working-tree check; `remediation-discipline` aborted (unmerged tip). Agent 2 created 8 archive tags (`archive/*-preserve-2026-05-20`) for the unmerged carryover worktrees and removed their worktree dirs; all 8 branches survived on disk. Net: 10 sibling-path worktree dirs removed, 8 branches preserved via tags + refs, 2 branches deleted post-merge (work was already on master). `remediation-discipline` was the sole residual sibling-path worktree pending operator decision (resolved 2026-05-21 per above).
- 2026-05-20: bulk-cleanup ran via `scripts/cleanup-merged-worktrees.mjs --execute` at master commit `261a751`. Removed 15 session-merged worktrees (q1-q8, q10, phase1-components, skill-credibility, track-a/b-code/b-doc, decisions-doc). Junction-aware fallback fix added 2026-05-20 at commit `535295c` after q5-tier-override cleanup destroyed main repo's node_modules.

## Known gaps

- **OBS-58**: Step 3 of the worktree-cleanup 3-step pattern (config-registry sweep against `~/.claude/settings.json` additionalDirectories) is currently manual. Automating in `cleanup-merged-worktrees.mjs` is queued for next cleanup-script touch.
