// RD-85: registered 2026-09-27 (docs/ops/session-log.d/2026-09-27-worktree-node-modules.md). One entry,
// one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-85',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 53: a worktree reaches the shared install through ONE link beside the ' +
    'worktrees, never a link inside a worktree',
  text:
    'A linked worktree must reach fsi-app\'s npm dependencies only through the one link beside the ' +
    'worktrees (<main>/.claude/worktrees/node_modules), never through a link inside the worktree, ' +
    'because git worktree remove (forced or not) empties the main checkout\'s shared install through a ' +
    'junction inside a worktree [CONFIRMED 2026-09-27, git 2.53.0.windows.1]; tooling must resolve a ' +
    'dependency the way Node does (lib/resolve-dep.mjs, or require.resolve with paths: [fsiAppDir]), ' +
    'never by building the path fsi-app/node_modules/<pkg>, which does not exist in that layout; and ' +
    'no build step may depend on a non-default OS setting (Developer Mode or an admin-granted right). ' +
    'post-checkout creates the link on git worktree add; pre-push step 0b self-heals (creates or ' +
    'replaces a missing or stale link, removes a junction inside the worktree with its target ' +
    'untouched) and fails fast naming the fix only when it cannot.',
  anchor:
    '### Section 4 - category 53: a worktree reaches the shared install through ONE link beside the ' +
    'worktrees, never a link inside a worktree',
  enforcedBy: [
    'fitness:F59',
    'selftest:fsi-app/.discipline/hooks/worktree-node-modules.test.mjs',
    'selftest:fsi-app/.discipline/lib/resolve-dep.test.mjs',
  ],
  residual:
    'The layout is created and repaired on the operator\'s machine by git hooks (post-checkout, ' +
    'pre-push step 0b), the same out-of-repo boundary as every installed hook (install-hooks.mjs); CI ' +
    'checks out a single real install and never exercises the worktree layout, so the end-to-end test ' +
    'proves the mechanism on throwaway repos rather than on a live fleet. A worktree created outside ' +
    '<main>/.claude/worktrees is refused with the convention named rather than linked (a link in an ' +
    'arbitrary parent directory would leak the install to unrelated projects). F59 is lexical: a ' +
    'dependency path assembled indirectly (variables concatenated across lines) is not seen; the ' +
    'consumers that existed were converted by hand and proven by attack against origin/master.',
};
