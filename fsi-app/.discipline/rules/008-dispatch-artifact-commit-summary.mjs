// Rule 008: Dispatch-artifact commit-summary
// Source: sprint-followups-discipline § Dispatch-artifact commit-summary rule
//
// Trigger: substantial dispatch landing on master that isn't investigation/hotfix/research/conversation.
// Check:   commit body contains a line starting with "Loop-closure:".
//
// The full OBS coverage table and DP compliance section remain in the dispatch
// report; this rule enforces the one-line audit summary in the commit artifact.

import { pass, fail, skip } from '../lib/result.mjs';
import {
  isSubstantialDispatch,
  isApplicableDispatchType,
  commitMessageHasLine,
} from '../lib/predicates.mjs';

export const rule = {
  id: '008',
  name: 'Dispatch-artifact commit-summary',
  description: 'Substantial dispatch commits on master must include a "Loop-closure:" line in the body.',
  ruleSource: 'sprint-followups-discipline § Dispatch-artifact commit-summary rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    if (!isSubstantialDispatch(ctx)) return false;
    return true;
  },

  check(ctx) {
    if (commitMessageHasLine(ctx, 'Loop-closure:')) return pass();
    return fail({
      message: 'Substantial dispatch commit missing required "Loop-closure:" line in body.',
      remediation: [
        'Add a line to the commit body summarizing OBS coverage outcomes and DP compliance.',
        'Format: Loop-closure: OBS-N COVER; OBS-M DEFER (reason); DP-1 PASS; DP-2 N/A',
        'Full reasoning belongs in the dispatch report; this line is the audit trail.',
      ].join('\n  '),
    });
  },
};

// Export skip helper for the runner to surface skipped rules with reasons.
export const skipReasons = {
  notOnMaster: 'rule applies to merge commits landing on master only',
  notApplicableType: 'commit subject indicates investigation, hotfix, research, conversation, merge, or revert',
  notSubstantial: 'commit does not meet substantial-dispatch criteria',
};
