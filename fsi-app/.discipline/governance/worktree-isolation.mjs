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

import { isChildSession, isLaneBranch } from '../lib/session-context.mjs';

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
  const gc = norm(gitCommonDir);
  // Lane GATE-8 (2026-10-08, AUD-AT-4 B7-29): the common directory is the answer when git gave it. The older test
  // was `git-dir contains "/worktrees/"`, which classed a MAIN checkout as a linked worktree whenever a directory
  // above it happened to be named worktrees (/work/worktrees/repo/.git), so the main checkout of such a machine was
  // never guarded. Equal directories are the main checkout; any difference is a linked worktree.
  if (gc) return gd === gc;
  // No common-dir information: a linked worktree's git-dir has the exact shape <repo>/.git/worktrees/<name>.
  return !/\/\.git\/worktrees\/[^/]+$/.test(gd);
}

// True when running in an AGENT (child / sub-agent) context, per the harness env marker. One predicate, shared with
// the hook side (../lib/session-context.mjs): absent, 0, false, no, off or empty all mean "not a child".
export function isAgentContext(env = {}) {
  return isChildSession(env);
}

// A lane's branch (lane/<id>) belongs to a worktree. A commit on it, or a checkout of it, in the MAIN checkout is the
// incident whether or not the child-session variable is set: a lane is a top-level session, and the variable is
// absent for it (AUD-AT-4 B7-28).
export function branchLooksLaneOwned(branch) {
  return isLaneBranch(branch);
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
export function evaluateCheckout({ gitDir, gitCommonDir, env, branch } = {}) {
  const main = isMainCheckout({ gitDir, gitCommonDir });
  const agent = isAgentContext(env);
  // HEAD arriving on a lane/ branch in the main checkout is the incident with or without the child-session marker.
  if (main && !agent && branchLooksLaneOwned(branch)) {
    return {
      blocked: true,
      doctrine: DOCTRINE,
      reason:
        `WORKTREE-ISOLATION VIOLATION (RD-19): the MAIN checkout is now on a lane branch (${branch}). Lane branches ` +
        'live in worktrees under .claude/worktrees/, never in the main checkout. HEAD has already moved, STOP, switch ' +
        'the main checkout back to master, and do NOT commit here. (post-checkout cannot undo the move.)',
    };
  }
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

// PRE-COMMIT verdict. Blocks a commit in the MAIN checkout when it is an agent context OR the branch is
// agent-owned (the corrupted state — an orchestrator commit about to land on an agent's label). This is
// the real block: a nonzero exit aborts the commit. In a worktree it never fires (not the main checkout).
export function evaluateCommit({ gitDir, gitCommonDir, env, branch } = {}) {
  if (!isMainCheckout({ gitDir, gitCommonDir })) return { blocked: false };
  const agent = isAgentContext(env);
  const agentBranch = branchLooksAgentOwned(branch);
  // A lane branch in the main checkout (AUD-AT-4 B7-28): a lane is a top-level session, so the child-session
  // variable is absent, "0", "false" or empty for it; the branch name is what says it is operating where it must not.
  const laneBranch = branchLooksLaneOwned(branch);
  if (agent || agentBranch || laneBranch) {
    return {
      blocked: true,
      doctrine: DOCTRINE,
      agent,
      agentBranch,
      laneBranch,
      reason:
        'WORKTREE-ISOLATION VIOLATION (RD-19): commit BLOCKED in the MAIN checkout — ' +
        (agent ? 'this is an agent context; ' : '') +
        (agentBranch ? `the checkout is on an agent-owned branch (${branch}); ` : '') +
        (laneBranch ? `the checkout is on a lane branch (${branch}), and lane branches live in worktrees; ` : '') +
        'the main checkout is the orchestrator\'s exclusive surface. An agent commits ONLY in its ' +
        'assigned worktree under .claude/worktrees/. Move the work to your worktree and retry.',
    };
  }
  return { blocked: false };
}

// Shared command matcher for the PreToolUse skill-gate belt: a git op that moves/creates a branch,
// merges, rebases, or adds a worktree — the class the doctrine governs. Single home so the hook and any
// other consumer cannot drift on which commands count.
// Allows leading global options (`-C <dir>`, `-c <k=v>`, `--no-pager`, ...) before the subcommand so
// `git -C /path checkout x` matches, while `git commit -m "...merge..."` does NOT (the token after `git`
// is `commit`, not a branch/merge/rebase subcommand). RESIDUAL: `git -c key=val checkout` (a `-c` with a
// space-separated value) and a read-only `git branch --show-current` are edge cases — the former can slip
// (rare in agent Bash), the latter over-surfaces an "ask" (harmless, main-session only).
// Lane GATE-8 (2026-10-08, AUD-AT-4 B7-30): the verbs that move HEAD or a branch ref are not only checkout, switch,
// branch, merge, rebase and worktree add. cherry-pick, reset, restore, revert, pull, update-ref, symbolic-ref and
// commit-tree land commits or move refs the same way, and `git.exe` is the same program. The leading global options
// (-C <dir>, -c k=v, --no-pager) may sit between the word git and the verb.
export function isBranchingGitCommand(cmd) {
  if (!cmd) return false;
  const verbs = 'checkout|switch|branch|merge|rebase|cherry-pick|reset|restore|revert|pull|update-ref|symbolic-ref|commit-tree|worktree\\s+add';
  return new RegExp(`\\bgit(?:\\.exe)?\\s+(?:-C\\s+\\S+\\s+|-c\\s+\\S+\\s+|-{1,2}\\S+\\s+)*(?:${verbs})\\b`, 'i').test(cmd);
}
