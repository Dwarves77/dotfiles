// Rule 024: A WIP commit carries [skip ci], and only a WIP commit does. Invariant: RD-98-wip-commit-skips-ci.
// Source: docs/plans/ci-minutes-plan-2026-10-10.md Phase 0 step 1; docs/decisions/ADR-047-metered-ci-free-tier.md;
// lane CI-MIN-0 (2026-10-10).
//
// The repository is private and GitHub Actions minutes are metered (2,000 per month, spending limit 0: CI
// stops, never bills). Lanes save-point with `WIP <lane>: <step> [skip ci]` commits (lane contract rule 15);
// each one that lacks the token runs a full ~25 runner-minute CI pass on a result that is about to be
// superseded. The other direction matters as much: a commit that carries the token without the WIP prefix
// silently turns CI off for a commit that is meant to be validated, and the pull request head is the one commit
// whose run is the gate.
//
// Trigger: any commit that is not a merge or a revert.
// Check:   FAIL when the subject starts with `WIP ` and the SUBJECT lacks a skip token, or when a commit whose
//          subject does not start with `WIP ` carries a skip token ANYWHERE in its message (the subject or the
//          body: GitHub honours the token in either). The accepted tokens are the ones GitHub documents:
//          [skip ci], [ci skip], [no ci], [skip actions], [actions skip], and the `skip-checks: true` trailer.
//          A normal subject with no token passes.
// Cutoff:  the rule applies only to commits made after it landed (lane CI-MIN-0b, 2026-10-11). In per-commit CI
//          mode a commit whose COMMITTER date is before RULE_024_LANDED is SKIPPED with the reason `commit
//          predates the rule`: every pull request open when PR 1102 merged carried `WIP ` commits authored the
//          day before the rule existed, and judging them failed validate-commits on the first update-branch
//          (PR 1097 run 38106594677: three FAIL [024]). commit-msg (local) mode is unchanged: a proposed commit
//          has no sha, is always after the cutoff, and is always judged. The whole-range squash-parity pass has
//          no sha either and is unchanged.
// Scope:   whole-commit (a message is a property of one commit; a squash merge does not re-judge it). A pull
//          request merges by squash and GitHub's default squash body lists every commit subject, so the squash
//          commit on master can carry the token of a WIP commit; that commit is created by GitHub, not by a
//          local commit-msg hook or a PR range, and is out of this rule's reach (reported on the lane PR).

import { execFileSync } from 'node:child_process';
import { pass, fail, skip } from '../lib/result.mjs';
import { getRepoRoot } from '../lib/context.mjs';

// The merge time of PR 1102 (CI-MIN-0, merged as ab3dcaa87), the instant rule 024 landed on master.
export const RULE_024_LANDED = '2026-10-11T02:52:00Z';
export const PREDATES_REASON = 'commit predates the rule';

const TOKEN_RES = [
  /\[skip ci\]/i,
  /\[ci skip\]/i,
  /\[no ci\]/i,
  /\[skip actions\]/i,
  /\[actions skip\]/i,
  /^skip-checks:\s*true\s*$/im,
];
const WIP_RE = /^WIP /;

export function hasSkipToken(text) {
  return TOKEN_RES.some((re) => re.test(String(text)));
}

export function isWipSubject(subject) {
  return WIP_RE.test(String(subject));
}

// The committer date (epoch ms) of the commit under judgement, or null when there is none to read: a proposed
// commit (commit-msg mode) and the whole-range context carry no sha, and an unreadable sha is judged, never
// skipped (a lookup failure must not switch the rule off). A test may set ctx.commitDate (ISO string) directly.
export function committerTime(ctx) {
  let iso = ctx.commitDate || null;
  if (!iso && ctx.commitSha) {
    try {
      iso = execFileSync('git', ['-C', getRepoRoot(), 'log', '-1', '--format=%cI', ctx.commitSha], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
}

export const rule = {
  id: '024',
  name: 'WIP commit carries [skip ci], and only a WIP commit does',
  description: 'A commit whose subject starts with "WIP " must carry a CI skip token in the subject; a commit whose subject does not start with "WIP " must carry no CI skip token anywhere in its message.',
  ruleSource: 'ci-minutes-plan-2026-10-10 Phase 0 step 1; ADR-047; lane CI-MIN-0',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return true;
  },

  check(ctx) {
    const when = committerTime(ctx);
    if (when !== null && when < Date.parse(RULE_024_LANDED)) {
      console.log(`024 skip: ${PREDATES_REASON}`);
      return skip(PREDATES_REASON);
    }
    const subject = ctx.commitSubject || '';
    if (isWipSubject(subject)) {
      if (hasSkipToken(subject)) return pass();
      return fail({
        message: 'A WIP commit must carry [skip ci] in its subject: metered CI minutes (2,000 per month) are spent only by the final push of a pull request.',
        remediation: [
          `Subject: ${subject}`,
          'Append [skip ci] to the subject, e.g. "WIP <lane>: <step> [skip ci]" (lane contract rule 15).',
          'Emergency bypass: git commit --no-verify.',
        ].join('\n  '),
      });
    }
    if (hasSkipToken(ctx.commitMessage || subject)) {
      return fail({
        message: 'A commit that is not a WIP commit must not carry a CI skip token: it would silence the CI run that validates this commit.',
        remediation: [
          `Subject: ${subject}`,
          'Either start the subject with "WIP " (a save-point commit) or remove the skip token from the subject and the body.',
          'Emergency bypass: git commit --no-verify.',
        ].join('\n  '),
      });
    }
    return pass();
  },
};
