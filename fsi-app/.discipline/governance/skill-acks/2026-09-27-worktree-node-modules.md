## Skill

remediation-discipline

## Change

`fsi-app/.claude/skills/remediation-discipline/SKILL.md` gains Section 4 category 53 ("a worktree
reaches the shared install through ONE link beside the worktrees, never a link inside a worktree"),
the anchor for the new invariant RD-85 (`governance/invariants.d/RD-85.mjs`, enforced by fitness F59,
`hooks/worktree-node-modules.test.mjs` and `lib/resolve-dep.test.mjs`).

It extends, and does not reinterpret, category 7's existing OBS-53 sub-issue (a worktree's
node_modules junction let a remover empty the main install, 2026-05-20). Category 7 fixed it at the
remover; category 53 records the source-level fix (no link is ever created inside a worktree) and the
new [CONFIRMED] finding that `git worktree remove` itself follows a junction on Git for Windows.

No existing category, rule or threshold changed.

## Citing files reviewed

This range adds no `GOVERNING SKILL(S):` citation of remediation-discipline. The new files cite RD-85
in their header comments, not `GOVERNING SKILL` markers, so they are not citers under
`skill-contract-map.mjs`'s scan pattern. The pre-existing citers under `fsi-app/src` and
`fsi-app/scripts` are unchanged in this range; category 53 adds a class and changes none of the
guidance they cite.
