// WORKTREE-ISOLATION detection primitive (RD-19). Pure, dependency-free, testable in isolation.
//
// GOVERNING skill: remediation-discipline (Section 4 category 14 — Worktree isolation). This is the
// single home for the decision logic the git-hook legs (post-checkout + pre-commit) and the PreToolUse
// skill-gate belt all consume, so the three surfaces cannot drift.
//
// THE DOCTRINE (verbatim, RD-19):
//   "Agent branch/checkout/merge operations occur ONLY in that agent's assigned worktree. The main
//    checkout is the orchestrator's exclusive surface. An agent that finds itself in the main checkout
//    stops and reports, it does not operate there."
//
// THE INCIDENT this prevents: a sub-agent ran `git checkout -b <branch>` in the MAIN checkout
// (the primary working tree) instead of its assigned worktree (under .claude/worktrees/). That moved the
// main checkout's HEAD onto the agent's branch; subsequent orchestrator commits landed on the wrong
// label and had to be manually untangled. The PreToolUse skill-gate did NOT catch it because PreToolUse
// was session-scoped and did NOT fire inside subagents/workflows when this was verified on 2026-06-07.
// [REFUTED 2026-09-19, lane M3]: it now DOES fire inside sub-agents -- the main checkout's own
// .gate-audit.log recorded 11 denials of a sub-agent's own Edit/Write calls, and lane G1 (issue 754)
// made the skill gate judge the acting agent's own transcript, closing the gap this incident exploited.
// The 2026-06-07 finding stays accurate as history; it no longer describes the present.
//
// DETECTION-SIGNAL CHOICE (recorded honestly):
//   * WHERE (main checkout vs linked worktree) — the CANONICAL git signal: a linked worktree's git-dir
//     lives under <common>/worktrees/<name>, so `git rev-parse --git-dir` differs from `--git-common-dir`
//     (and contains "/worktrees/"); in the main checkout they are equal. Zero-false-positive, no env needed.
//   * WHO (agent vs orchestrator) — the env marker CLAUDE_CODE_CHILD_SESSION, which the Claude Code harness
//     sets truthy for child/sub-agent sessions and leaves absent/0 for the main orchestrator session
//     (observed live in an agent Bash context: CLAUDE_CODE_CHILD_SESSION=1). AI_AGENT is present in BOTH
//     the orchestrator and agents (it names the claude-code agent), so it does NOT discriminate and is not
//     used. RESIDUAL: this rests on the harness naming — if a future harness ran the orchestrator itself as
//     a child session, or spawned an agent WITHOUT the marker, the WHO signal would misfire; the pre-commit
//     branch-name belt (below) is the backstop that does not depend on env at all.
//
// FAIL-CLOSED posture: the block fires on a POSITIVE agent signal in the main checkout. When the WHO signal
// is absent we assume orchestrator and ALLOW — the main checkout IS the orchestrator's exclusive surface,
// so blocking it unconditionally would break the legitimate operator/orchestrator workflow. The honest
// residual is that an agent whose env lacks the marker slips the WHO gate; the pre-commit branch-name belt
// catches the resulting corrupted state (main checkout sitting on an agent-owned branch) regardless of env.

function norm(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export const DOCTRINE =
  "Agent branch/checkout/merge operations occur ONLY in that agent's assigned worktree. The main " +
  "checkout is the orchestrator's exclusive surface. An agent that finds itself in the main checkout " +
  'stops and reports, it does not operate there.';

// True when the git working tree is the PRIMARY (main) checkout, not a linked worktree.
// Signal: a linked worktree's git-dir is <common>/worktrees/<name>, which (a) contains "/worktrees/"
// and (b) differs from the git-common-dir. The main checkout's git-dir equals its git-common-dir.
export function isMainCheckout({ gitDir, gitCommonDir } = {}) {
  const gd = norm(gitDir);
  if (!gd) return false; // unknown WHERE → not provably main (WHO signal still gates)
  if (gd.includes('/worktrees/')) return false; // linked worktree
  const gc = norm(gitCommonDir);
  if (gc) return gd === gc;
  return true; // git-dir present, not under /worktrees/, no common-dir info → main
}

// True when running in an AGENT (child / sub-agent) context, per the harness env marker.
export function isAgentContext(env = {}) {
  const v = env?.CLAUDE_CODE_CHILD_SESSION;
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return Boolean(v);
}

// Branch names that a git worktree / agent owns by convention. The auto-created worktree branch is
// `worktree-agent-<hex>`; the older convention is `agent-<hex>`. The MAIN checkout must never sit on one
// (git will not normally allow it — the branch is checked out in its worktree — so if it does, that IS the
// corrupted state from the incident). Kept deliberately tight so legit branches (guard/*, feat/*, arch/*)
// never match.
export function branchLooksAgentOwned(branch) {
  const b = (branch || '').trim();
  if (!b) return false;
  return /^worktree-agent-[0-9a-f]+$/i.test(b) || /^agent-[0-9a-f]{6,}$/i.test(b);
}

// POST-CHECKOUT verdict. An agent performing a branch checkout in the MAIN checkout is the incident.
// The hook cannot UNDO the move (git already switched HEAD) — this is detection + a LOUD alarm.
export function evaluateCheckout({ gitDir, gitCommonDir, env } = {}) {
  const main = isMainCheckout({ gitDir, gitCommonDir });
  const agent = isAgentContext(env);
  if (main && agent) {
    return {
      blocked: true,
      doctrine: DOCTRINE,
      reason:
        'WORKTREE-ISOLATION VIOLATION (RD-19): an AGENT context performed a branch checkout in the MAIN ' +
        'checkout. Agents operate ONLY in their assigned worktree under .claude/worktrees/. HEAD has already ' +
        'moved — STOP, report to the orchestrator, and do NOT commit here. (post-checkout cannot undo the move.)',
    };
  }
  return { blocked: false };
}

// PRE-COMMIT verdict. Blocks a commit in the MAIN checkout. This is the real block: a nonzero exit aborts
// the commit. In a worktree it never fires (not the main checkout).
//
// GATE-7 (2026-10-08, attacks A-H1-1 to A-H1-7 of the AUD-AT-3 register): the verdict no longer depends on the
// WHO signal. CLAUDE_CODE_CHILD_SESSION absent, 0, false or empty all mean "not a child", and a harness that
// forgets to set the marker, or a session started with it cleared, is exactly the case this belt exists for;
// the marker was an honest-form blind spot (three of the seven register rows were just its value). A commit
// (or a merge commit, same function, `op`) in the MAIN checkout is refused for everyone: the main checkout is
// a read surface (vault-sync fast-forwards it; every change lands through a worktree and a PR). The verdict
// still reports whether the marker or an agent-owned branch name was seen, for the message.
export function evaluateCommit({ gitDir, gitCommonDir, env, branch, op = 'commit' } = {}) {
  if (!isMainCheckout({ gitDir, gitCommonDir })) return { blocked: false };
  const agent = isAgentContext(env);
  const agentBranch = branchLooksAgentOwned(branch);
  return {
    blocked: true,
    doctrine: DOCTRINE,
    agent,
    agentBranch,
    reason:
      `WORKTREE-ISOLATION VIOLATION (RD-19): ${op} BLOCKED in the MAIN checkout. ` +
      (agent ? 'This is an agent context. ' : '') +
      (agentBranch ? `The checkout is on an agent-owned branch (${branch}). ` : '') +
      'The main checkout takes no commits or merges from anyone (the child-session marker is not trusted: ' +
      'absent, 0, false and empty all read as "not a child"). Work in a worktree under .claude/worktrees/ ' +
      'and land it through a pull request.',
  };
}

// POST-COMMIT verdict. pre-commit and pre-merge-commit are the blocks; a commit created by cherry-pick, am or
// another path that does not run them has already landed when post-commit fires, so this is detection + a
// LOUD alarm in the same words. Never fires in a linked worktree.
export function evaluateLanded({ gitDir, gitCommonDir, env, branch } = {}) {
  const v = evaluateCommit({ gitDir, gitCommonDir, env, branch, op: 'commit (landed through a path that skips pre-commit: cherry-pick, am, rebase)' });
  return v.blocked ? { ...v, reason: `${v.reason} The commit already exists: move it to a worktree branch and reset the main checkout to origin/master.` } : v;
}

// REFERENCE-TRANSACTION verdict. `git reset --hard`, `git symbolic-ref HEAD`, `git update-ref` and the other
// plumbing that moves HEAD or the checked-out branch fire no checkout hook, but every ref update runs the
// reference-transaction hook. An AGENT context doing that in the MAIN checkout is the incident (a branch
// moved under the orchestrator); like post-checkout this is detection + alarm, never a block (the move has
// happened by the "committed" state). Humans and vault-sync (which sets DISCIPLINE_VAULT_SYNC) never alarm.
export function evaluateRefMove({ gitDir, gitCommonDir, env } = {}) {
  if (!isMainCheckout({ gitDir, gitCommonDir })) return { blocked: false };
  if (!isAgentContext(env)) return { blocked: false };
  if (env?.DISCIPLINE_VAULT_SYNC) return { blocked: false };
  return {
    blocked: true,
    doctrine: DOCTRINE,
    reason:
      'WORKTREE-ISOLATION VIOLATION (RD-19): an AGENT context moved HEAD or the checked-out branch in the MAIN ' +
      'checkout (reset --hard, symbolic-ref, update-ref or similar). The ref has already moved. STOP, report ' +
      'to the orchestrator, and do NOT commit here.',
  };
}

// Shared command matcher for the PreToolUse skill-gate belt: a git op that moves/creates a branch,
// merges, rebases, or adds a worktree — the class the doctrine governs. Single home so the hook and any
// other consumer cannot drift on which commands count.
// Allows leading global options (`-C <dir>`, `-c <k=v>`, `--no-pager`, ...) before the subcommand so
// `git -C /path checkout x` matches, while `git commit -m "...merge..."` does NOT (the token after `git`
// is `commit`, not a branch/merge/rebase subcommand). RESIDUAL: `git -c key=val checkout` (a `-c` with a
// space-separated value) and a read-only `git branch --show-current` are edge cases — the former can slip
// (rare in agent Bash), the latter over-surfaces an "ask" (harmless, main-session only).
export function isBranchingGitCommand(cmd) {
  if (!cmd) return false;
  return /\bgit\s+(?:-C\s+\S+\s+|-{1,2}\S+\s+)*(?:checkout|switch|branch|merge|rebase|worktree\s+add)\b/i.test(cmd);
}
