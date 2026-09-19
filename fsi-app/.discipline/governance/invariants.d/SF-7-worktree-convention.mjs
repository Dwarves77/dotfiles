// SF-7-worktree-convention: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-7-worktree-convention',
    skill: 'sprint-followups-discipline',
    section: 'Worktree path convention',
    text: 'Worktrees live under .worktrees/ (FaDB-recognized); live worktrees match the worktrees inventory.',
    anchor: 'Worktree path convention',
    enforcedBy: ['consistency:C4'],
    residual: 'C4 proves live worktrees == inventory; the .worktrees/ path convention itself is operator discipline at worktree-creation.',
  };
