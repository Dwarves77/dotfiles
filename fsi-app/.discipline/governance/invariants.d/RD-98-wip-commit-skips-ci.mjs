// RD-98: registered by lane CI-MIN-0 (2026-10-10). One entry, one file; see invariants.d/README.md.
// Id RD-98 taken as the next free id after RD-97 (no open pull request registers one).

export const invariant = {
  id: 'RD-98-wip-commit-skips-ci',
  skill: 'remediation-discipline',
  section: 'Section 2: The Class-Over-Instance Principle (a recurring process failure is prevented mechanically, not by an advisory header)',
  text: 'A commit whose subject starts with "WIP " must carry a CI skip token ([skip ci]) in its subject, and a commit whose subject does not start with "WIP " must carry no CI skip token anywhere in its message. The repository is private and GitHub Actions minutes are metered (2,000 per month, spending limit 0): save-point commits must not spend a CI run, and the commit that is the pull request head must never be silenced. It was a convention in the lane contract (rule 15) with no check until rule 024. The rule judges only commits whose committer date is at or after 2026-10-11T02:52:00Z, when PR 1102 merged it (earlier commits are skipped in per-commit CI mode); the commit-msg hook always judges.',
  anchor: 'The Class-Over-Instance Principle',
  enforcedBy: ['rule:024'],
  residual: 'Rule 024 judges commit messages that pass through the local commit-msg hook and the CI range walk. The squash commit GitHub creates on merge is not judged by it: with the repository default of squash bodies listing every commit subject, that commit can carry a WIP commit\'s token (reported on the lane PR as an open item for the merge path).',
};
