## Anti-Patterns

These behaviors mean the skill was loaded but not followed:

- **Reading followups.md or design-principles.md without acting on it.** The dispatch report does not include the OBS coverage table or the DP compliance section. The agent has done the read but not the discipline. Equivalent to not loading the skill at all.
- **Claiming "no relevant OBS" or "DP-N does not apply" without listing what was reviewed.** "I read the followups doc and none applied" is not a discharge. The coverage table lists every OBS the agent read, even Implemented or Cleared ones, so the reviewer can verify the relevance call. The DP compliance section lists every DP, with reasoning even for "not applicable", so the reviewer can verify the agent read it.
- **Treating Implemented or Cleared OBS as still open.** A coverage table that asks for design action on OBS-1 (cleared three sprints ago) wastes review attention. Read the state annotations before assigning action.
- **Deferring an OBS without naming the next owner.** "Deferred to a future dispatch" is a punt, not a routing. Every deferral names the receiving phase, sprint, or skill domain so the followups doc accumulates a routing graph rather than a backlog.
- **Deferring a DP failure.** DP entries are binding cross-sprint axioms and cannot be deferred. A DP failure means redesign or HALT, never defer.
- **Accepting "partial DP compliance".** DP compliance is binary by construction. "Mostly compliant" or "compliant in the common path" are failures.
- **Adding new OBS entries without cross-references.** New entries that don't link to related existing OBS or relevant DP entries break the cross-reference graph. The next dispatch reading the doc loses the connectivity context.
- **Authoring new DP entries without operator authorization.** The agent may surface candidate principles in followups OBS entries or in dispatch reports, but does not add a new DP-N to `docs/design/design-principles.md` (and `docs/design/ux-laws.md`, DP-2) without operator authorization (see the authorship rule in the registry).
- **Skipping the skill on "small" dispatches.** A small dispatch that touches a phase surface still owes loop closure. The skill applies by dispatch type (design or implementation on a phase), not by perceived scope size.

## Worktree path convention

When a dispatch (this discipline or any other) creates a git worktree, the worktree path MUST be under `C:/Users/jason/dotfiles/.worktrees/wt-<dispatch-name>` (i.e., inside the repo at `.worktrees/`). This is the path that `superpowers:finishing-a-development-branch` (FaDB) recognizes as eligible for automatic cleanup in its Step 6 provenance check.

DO NOT create worktrees as siblings to the repo root (`C:/Users/jason/dotfiles-wt-<name>`). That convention bypasses FaDB's provenance check; FaDB will refuse to clean those worktrees because it treats them as host-managed. Stale worktrees accumulate.

This convention was added 2026-05-20 after operator audit found 22+ stale worktrees at sibling-path convention. Cleanup script at `fsi-app/scripts/cleanup-merged-worktrees.mjs` handles the historical bulk cleanup of sibling-path worktrees; going-forward worktrees follow the `.worktrees/` convention so FaDB Step 6 handles cleanup automatically on dispatch completion.

When writing a dispatch brief that instructs an agent to set up a worktree, use:

```
git -C C:/Users/jason/dotfiles worktree add C:/Users/jason/dotfiles/.worktrees/wt-<dispatch-name> -b feat/<branch-name> master
```

NOT:

```
git -C C:/Users/jason/dotfiles worktree add C:/Users/jason/dotfiles-wt-<dispatch-name> -b feat/<branch-name> master
```

## Integration With the Standing Skill-Load Rule

This skill loads alongside, not instead of, domain-relevant skills. On a Phase 6 brief-generation dispatch, the agent loads `environmental-policy-and-innovation` (governs brief content rules) AND this skill (governs OBS loop closure). On a Phase 7 triage UI dispatch, the agent loads `frontend-design` (governs UI patterns) AND this skill. Skill load is additive, not exclusive.

The integrity rule from `environmental-policy-and-innovation` applies here too: the OBS coverage table's reasoning is grounded in what the OBS entry actually says, not in what the agent infers from the title. If the OBS entry has thin content and the agent cannot ground the cover/defer decision in the entry's substance, surface the gap to the operator rather than inventing a justification.
