// Rule 001: Sweep-discipline
// Source: sprint-followups-discipline § Sweep-discipline rule
//
// Trigger: sweep-shaped dispatches on master. A sweep is signaled by the
//          commit subject family (audit|sweep|investigation|discovery|inspect|explore)
//          OR an explicit "Dispatch-type: sweep" attestation line. These dispatches
//          are excluded from rule 008/011 by isApplicableDispatchType but still owe
//          enumerate-first discipline; this rule fills that gap.
// Check:   commit body contains at least one line beginning with "Sweep-enumeration:".
//          The line must name the surface family, the enumeration method, and the
//          count. We enforce shape (line presence + minimum substance) at the
//          discipline layer; the operator verifies the enumeration was honest.
//
// The full pre-flight enumeration table belongs in the dispatch report; the
// commit-body line is the audit trail.

import { pass, fail } from '../lib/result.mjs';
import {
  commitMessageHasLine,
  commitMessageLines,
  commitSubjectMatches,
} from '../lib/predicates.mjs';

// Sweep-shaped commit subjects. Mirrors isInvestigationOnly's family plus
// the explicit "sweep:" prefix that audit-style work commonly uses.
const SWEEP_SUBJECT_RE = /^(audit|sweep|investigation|discovery|explore|inspect):/i;

export const rule = {
  id: '001',
  name: 'Sweep-discipline',
  description: 'Sweep dispatches on master must include a "Sweep-enumeration:" line documenting full surface enumeration.',
  ruleSource: 'sprint-followups-discipline § Sweep-discipline rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    // Sweep-shaped subject OR self-attested dispatch type
    if (commitSubjectMatches(ctx, SWEEP_SUBJECT_RE)) return true;
    if (commitMessageHasLine(ctx, 'Dispatch-type: sweep')) return true;
    return false;
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Sweep-enumeration:');
    if (lines.length === 0) {
      return fail({
        message: 'Sweep dispatch commit missing required "Sweep-enumeration:" line in body.',
        remediation: [
          'Add one Sweep-enumeration line per surface family swept.',
          'Format: Sweep-enumeration: <surface-family> via <method> N items',
          'Example: Sweep-enumeration: src/app/api/admin/**/*.ts via Glob 28 items',
          'The line documents that the sweep enumerated the COMPLETE surface (Glob, schema query, or equivalent) rather than relying on recalled or pattern-matched scope.',
          'Full enumeration table belongs in the dispatch report; this line is the audit trail.',
        ].join('\n  '),
      });
    }

    // Substance check: each line must reference an enumeration method and a count.
    // Accept any digit token as the count; accept any of via/Glob/grep/schema/query
    // as the method signal.
    const METHOD_RE = /\b(via|Glob|glob|grep|schema|query|ls|find|enumerate)\b/;
    const COUNT_RE = /\b\d+\b/;
    const thin = lines.filter((line) => !METHOD_RE.test(line) || !COUNT_RE.test(line));
    if (thin.length > 0) {
      return fail({
        message: 'Sweep-enumeration line(s) missing enumeration method and/or item count.',
        remediation: [
          'Each Sweep-enumeration line must name the enumeration method (Glob, grep, schema query, etc.) and the count.',
          'Format: Sweep-enumeration: <surface-family> via <method> N items',
          `Thin lines found: ${thin.map((l) => `"${l}"`).join('; ')}`,
        ].join('\n  '),
      });
    }

    return pass();
  },
};
