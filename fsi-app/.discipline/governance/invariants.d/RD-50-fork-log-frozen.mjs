// RD-50-fork-log-frozen: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-50-fork-log-frozen',
    skill: 'remediation-discipline',
    section: 'Section 2 — Class-Over-Instance (a recurring process failure is prevented mechanically, not by an advisory header)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The deprecated session-log fork fsi-app/docs/ops/session-log.md is frozen: no commit may ADD content to it (the canonical log is docs/ops/session-log.md at the repo root). Four independent sessions wrote to the fork by mistake against one advisory header — a recurrence class, not a fluke — so the header is replaced by a commit-time content guard that rejects any addition to the fork (a pure deletion is allowed; merge/revert commits are exempt).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'The Class-Over-Instance Principle',
    enforcedBy: ['rule:020'],
    residual: 'PreToolUse/skill-gate does not fire in subagents; the commit-time rule 020 fires on every non-merge commit in the validate-commits CI job, catching the write regardless of session type at commit time.',
  };
