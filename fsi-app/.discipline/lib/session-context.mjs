// THE ONE PREDICATE for "is this a child session, and is this a lane branch" (lane GATE-8, 2026-10-08, AUD-AT-4
// B7-28). Shared between the governance module (governance/worktree-isolation.mjs) and the hook side (GATE-7's hook
// scripts and PreToolUse gate import it, so the two cannot disagree about what the environment says).
//
// The harness marks a child (sub-agent) session with the environment variable CLAUDE_CODE_CHILD_SESSION. The
// variable is ABSENT, "0", "false" or empty for a session that is not a child, and anything else is a child. The
// earlier test was an exact-case string compare on three spellings, which a stray space (" 0"), "False", "no" or
// "off" turned into a child (a refusal of a legitimate session) and which read a non-string truthy value as a
// child without looking at it. The reading here trims, ignores case, and names the not-a-child spellings.
//
// The variable alone cannot say that a LANE is running in the main checkout (a lane session is a top-level
// session: the variable is absent for it). The second half of the predicate is the branch: a branch under
// `lane/` is a lane's branch, and lane branches live in worktrees, never in the main checkout. A commit or a
// checkout of a lane branch in the main checkout is the incident the doctrine names whether or not the variable
// is set.
//
// Pure, node builtins only (the no-npm discipline glob).

const NOT_A_CHILD = new Set(['', '0', 'false', 'no', 'off', 'null', 'undefined']);

/** True when `env` marks a child (sub-agent) session. @param {Record<string, unknown>} [env] */
export function isChildSession(env = process.env) {
  const v = env?.CLAUDE_CODE_CHILD_SESSION;
  if (v === undefined || v === null || v === false || v === 0) return false;
  if (typeof v === 'string') return !NOT_A_CHILD.has(v.trim().toLowerCase());
  return Boolean(v);
}

/** True when `branch` is a lane's branch (lane/<id>). Lane branches belong to worktrees. @param {string} [branch] */
export function isLaneBranch(branch) {
  return /^lane\/\S+/.test(String(branch ?? '').trim());
}
