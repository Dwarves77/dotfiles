# Git Worktrees Inventory

Catalog of current git worktrees with branch + merged-status + lifecycle state. Maintained per the Inventory-artifact emission rule + the worktree-cleanup class fix (OBS-53 + remediation-discipline Section 4 category 7).

## Status

**Populated 2026-05-20** (first substantive population of the inventory after the 2026-05-20 stub).

Current state per `git worktree list`: **11 worktrees** = 1 main + 1 active in-flight + 2 protect-list (recently merged) + 8 carryover from prior sessions (unmerged; preserved by cleanup-script safety design).

## Path convention (binding)

New worktrees go under `C:/Users/jason/dotfiles/.worktrees/wt-<name>` per FaDB recognized paths. Sibling-to-repo-root convention (`dotfiles-wt-<name>`) is anti-pattern; bypasses FaDB cleanup discipline. See remediation-discipline Section 7 Example 7.

## Worktree state

### Main + active in-flight

| Path | Branch | Ahead/Behind master | Last commit | Suggested disposition |
|---|---|---|---|---|
| `dotfiles` | `master` | n/a | varies | Keep |
| `dotfiles-wt-phase1.5-consumers` | `feat/phase1.5-tier-consumer-migration` | (in flight) | 2026-05-19 | KEEP — Item 2 agent `a320022` still running |

### Protect-list (recently merged; eligible for cleanup but preserved for operator review)

| Path | Branch | Status | Last commit | Suggested disposition |
|---|---|---|---|---|
| `dotfiles-wt-q4-resilience` | `feat/q4-batch-resilience` | Merged to master (commit `e082461`) | 2026-05-20 | Safe to remove after next cleanup pass |
| `dotfiles-wt-remediation-discipline` | `feat/remediation-discipline-skill` | Merged to master (commit `e8d03a7`) | 2026-05-20 | Safe to remove after next cleanup pass |

### Carryover from prior sessions (unmerged; operator-decision required)

Each carries 1-3 commits ahead of master with substantive work. Cleanup script preserves them by safety design (branch not merged into master). Operator can decide per-worktree: merge, cherry-pick, archive-and-discard, or keep-as-staging.

| Path | Branch | Ahead | Behind | Last commit (date) | Commit subject | Suggested disposition |
|---|---|---|---|---|---|---|
| `dotfiles-wt-4issues` | `fix(ui)/4-issues-wt-2026-05-12` | 3 | 115 | 2026-05-12 | fix(regulations): surface penalty schedule + sector-aware exposure | Review for cherry-pick or rebase + merge; oldest of the carryovers; check whether the regulation fixes are still needed after Build 4 routing landed |
| `dotfiles-wt-ecovadis` | `fix/ecovadis-vendor-classification` | 1 | 114 | 2026-05-15 | fix(classification): reclassify EcoVadis as vendor_corporate | Small data-fix branch; safe single-commit cherry-pick to master if still applicable; review against current `sources` table state for EcoVadis |
| `dotfiles-wt-masthead-uuid` | `fix/regulation-masthead-uuid` | 1 | 114 | 2026-05-15 | fix(regulations): remove raw id from regulation detail masthead meta | Small UI fix; cherry-pick + merge if regulation detail masthead still has the UUID issue |
| `dotfiles-wt-mt-A` | `feat/multi-tenant-A-schema-cleanup` | 1 | 100 | 2026-05-15 | feat(multi-tenant): consolidate user_profiles into profiles (Phase 1+2) | Part of mt-A/B/C trilogy; operator-decision multi-tenant work; coordinate decision across all three |
| `dotfiles-wt-mt-B` | `feat/multi-tenant-B-invitations` | 1 | 100 | 2026-05-15 | feat(multi-tenant): B. invitations infrastructure + onboarding state machine | Same trilogy; coordinate with A + C |
| `dotfiles-wt-mt-C` | `feat/multi-tenant-C-rpc-membership-checks` | 1 | 100 | 2026-05-15 | feat(multi-tenant): C. membership-scoped data access (RPC hardening + group pool) | Same trilogy; coordinate with A + B |
| `dotfiles-wt-rebase-99` | `rebase/pr-99-on-master` | 1 | 102 | 2026-05-15 | fix(pages): /market /research /operations meet design framework + use true total | Was PR-99 rebase attempt; operator-decision on whether to re-fire as fresh PR or discard if PR-99 closed otherwise |
| `dotfiles-wt-rebase-104` | `rebase/pr-104-on-master` | 1 | 102 | 2026-05-15 | refactor(rpcs): extract shared workspace-scope SQL function | Was PR-104 rebase attempt; same decision shape as rebase-99 |

## Maintenance trigger

Per Inventory-artifact emission rule: any dispatch that creates OR removes a worktree MUST update this inventory + emit `Inventory-emission:` line. The cleanup script (`scripts/cleanup-merged-worktrees.mjs`) can emit on `--execute` runs.

## Cleanup history

- 2026-05-20: bulk-cleanup ran via `scripts/cleanup-merged-worktrees.mjs --execute` at master commit `261a751`. Removed 15 session-merged worktrees (q1-q8, q10, phase1-components, skill-credibility, track-a/b-code/b-doc, decisions-doc). Junction-aware fallback fix added 2026-05-20 at commit `535295c` after q5-tier-override cleanup destroyed main repo's node_modules.

## Known gaps

- **OBS-58**: Step 3 of the worktree-cleanup 3-step pattern (config-registry sweep against `~/.claude/settings.json` additionalDirectories) is currently manual. Automating in `cleanup-merged-worktrees.mjs` is queued for next cleanup-script touch.
- **Carryover decision**: the 8 carryover worktrees above need per-worktree operator decisions. None are clearly safe to force-discard given each has 1-3 commits with substantive work. The mt-A/B/C trilogy in particular looks like coordinated work that may want to land together or be intentionally retired together.
