// Rule 020: The deprecated session-log fork is frozen (no new content)
// Source: divergence-register finding, four recorded instances (2026-07-17 → 2026-07-20)
//
// The canonical session log is `docs/ops/session-log.md` at the REPO ROOT (CLAUDE.md standing
// rule 6 + the self-annealing protocol). The file `fsi-app/docs/ops/session-log.md` is a
// DEPRECATED FORK that stopped receiving real entries after commit 42ac8969 (2026-07-17); it
// carries its own deprecation header. Four independent sessions have nonetheless written real
// work to the fork by mistake (the 2026-07-18 restart misdiagnosis, Session B's 2026-07-17
// containment-bank miss, the 2026-07-19 merge-time catch, and the 2026-07-20 exhaustion-pass
// near-miss caught at staging). Three-plus misses against one advisory header is a pattern, not
// a fluke; the header only helps a session that happens to read the file first. This rule is the
// mechanical guard the divergence register recommended: reject any commit that ADDS content to
// the fork, regardless of session discipline.
//
// Trigger: a commit that stages the fork path with additions > 0.
// Check:   FAIL if any added line lands in the fork. A pure deletion (removing the fork, or
//          trimming it) is allowed — only NEW content is rejected. Numstat additions are
//          sufficient here: any addition to a frozen file is the violation, no hunk text needed.

import { pass, fail, skip } from '../lib/result.mjs';

// The deprecated fork, repo-relative, forward-slash normalized.
const FORK_PATH = 'fsi-app/docs/ops/session-log.md';

function normalize(p) {
  return String(p).replaceAll('\\', '/');
}

function forkAdditions(ctx) {
  return ctx.stagedFiles.filter(
    (f) => normalize(f.path) === FORK_PATH && f.status !== 'D' && (f.additions ?? 0) > 0,
  );
}

export const rule = {
  id: '020',
  name: 'Deprecated session-log fork is frozen',
  description:
    'No commit may add content to fsi-app/docs/ops/session-log.md (the deprecated fork). ' +
    'The canonical session log is docs/ops/session-log.md at the repo root.',
  ruleSource: 'Divergence register — four recorded fork-write instances (2026-07-17 → 2026-07-20)',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false; // a master-merge may carry the fork's history; not a new write
    if (ctx.isRevertCommit) return false;
    return forkAdditions(ctx).length > 0;
  },

  check(ctx) {
    const offenders = forkAdditions(ctx);
    if (offenders.length === 0) return pass();
    const added = offenders.reduce((n, f) => n + (f.additions ?? 0), 0);
    return fail({
      message:
        `Commit adds ${added} line(s) to the DEPRECATED session-log fork (${FORK_PATH}). ` +
        'This fork is frozen; four sessions have written to it by mistake.',
      remediation: [
        'Write the entry to the CANONICAL log instead: docs/ops/session-log.md (repo root).',
        `Revert the change to ${FORK_PATH} (git checkout -- ${FORK_PATH}) and re-append at the root path.`,
        'A pure deletion of the fork is allowed; only ADDED content is rejected.',
        'Emergency bypass: git commit --no-verify.',
      ].join('\n  '),
    });
  },
};

export const _FORK_PATH = FORK_PATH;
