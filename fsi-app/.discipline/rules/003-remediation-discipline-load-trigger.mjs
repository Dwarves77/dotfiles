// Rule 003: Remediation-discipline load-trigger
// Source: sprint-followups-discipline § Remediation-discipline load-trigger rule
//
// Trigger: commit shape matches a remediation framing per the 5 triggers in the rule:
//   1. Framed as remediation, post-mortem, hotfix, or failure response (subject prefix)
//   2. Investigating a recurring pattern (commit message keyword surfacing)
//   3. Extracting a primitive, library, or shared utility (touches fsi-app/scripts/lib/ as new file)
//   4. Adding a new binding rule to any discipline skill (touches SKILL.md)
//   5. Scoping the response to a surfaced bug, regression, or production incident (subject prefix)
//
// Check: commit body contains both:
//   - "Skill-loaded: remediation-discipline" attestation
//   - "Class-vs-instance:" line documenting whether the remediation is class-shaped or instance-only
//     (per Section 3 recognition criteria of the remediation-discipline skill)

import { pass, fail, skip } from '../lib/result.mjs';
import {
  commitMessageHasLine,
  commitSubjectMatches,
  commitMessageMatches,
  hasFileMatching,
  filesMatching,
} from '../lib/predicates.mjs';

// Detects whether the commit shape qualifies as a remediation-shaped dispatch.
function isRemediationShaped(ctx) {
  // Trigger 1 + 5: subject prefix names remediation / post-mortem / hotfix / fix / patch / failure
  if (commitSubjectMatches(ctx, /^(hotfix|fix|patch|remediation|post[- ]?mortem|incident|regression):/i)) {
    return true;
  }

  // Trigger 2: explicit recurrence-pattern framing in subject or body
  if (commitMessageMatches(ctx, /\brecurring (pattern|failure|issue|bug)\b/i)) return true;
  if (commitMessageMatches(ctx, /\bclass[- ]?(fix|shape|shaped)\b/i)) return true;
  if (commitMessageHasLine(ctx, 'Class-fix:')) return true;

  // Trigger 3: extracting a primitive / library / shared utility = new file under scripts/lib/
  const newLibFiles = filesMatching(ctx, 'fsi-app/scripts/lib/').filter((f) => f.status === 'A');
  if (newLibFiles.length > 0) return true;

  // Trigger 4: adding/modifying a binding rule = touches a SKILL.md
  if (hasFileMatching(ctx, '**/SKILL.md')) return true;

  return false;
}

export const rule = {
  id: '003',
  name: 'Remediation-discipline load-trigger',
  description: 'Remediation-shaped commits must attest remediation-discipline loaded and document class-vs-instance call.',
  ruleSource: 'sprint-followups-discipline § Remediation-discipline load-trigger rule',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return isRemediationShaped(ctx);
  },

  check(ctx) {
    const hasSkillLoaded = commitMessageHasLine(ctx, 'Skill-loaded: remediation-discipline');
    const hasClassVsInstance = commitMessageHasLine(ctx, 'Class-vs-instance:');

    if (hasSkillLoaded && hasClassVsInstance) return pass();

    const missing = [];
    if (!hasSkillLoaded) missing.push('"Skill-loaded: remediation-discipline"');
    if (!hasClassVsInstance) missing.push('"Class-vs-instance:"');

    return fail({
      message: `Remediation-shaped commit missing required ${missing.join(' and ')} line(s) in body.`,
      remediation: [
        'Add both lines to the commit body.',
        'Format:',
        '  Skill-loaded: remediation-discipline',
        '  Class-vs-instance: <class|instance> - <one-line reasoning per Section 3 recognition criteria>',
        'Examples:',
        '  Class-vs-instance: instance - single-row data fix, no recurring pattern signals.',
        '  Class-vs-instance: class - recognition signals 2 + 4 fire (recurrence + shared primitive gap); extracting batch-primitives library.',
      ].join('\n  '),
    });
  },
};
