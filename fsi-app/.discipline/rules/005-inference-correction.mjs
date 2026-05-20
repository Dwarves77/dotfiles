// Rule 005: Inference correction
// Source: sprint-followups-discipline § Inference correction rule
//
// Trigger: downstream synthesis dispatches landing on master that touch a
//          previously-investigated surface. Detected by subject family
//          (reconstruction|implementation|synthesis|audit|reconciliation) OR by
//          self-attested "Dispatch-type: synthesis|reconstruction|reconciliation"
//          OR by touching files commonly used as reconstruction/synthesis output
//          (docs/sprint-*/*reconstruction*.md, docs/sprint-*/*synthesis*.md).
//          The discipline-engine cannot detect contradiction passively; it can
//          only require an explicit attestation that the agent CHECKED for it.
// Check:   commit body contains a line beginning with "Inference-correction:".
//          The line is either:
//            (a) "Inference-correction: <prior-dispatch> § <claim> → <corrected fact>, evidence: <source>"
//                when a contradiction was found, or
//            (b) "Inference-correction: no contradictions surfaced"
//                when the synthesis verified prior inferences against new evidence and
//                everything agreed.
//          Both forms force the agent to make the call explicitly rather than
//          silently aligning to a prior inference.

import { pass, fail } from '../lib/result.mjs';
import {
  commitMessageHasLine,
  commitMessageLines,
  commitSubjectMatches,
  hasFileMatching,
} from '../lib/predicates.mjs';

// Subjects that signal downstream synthesis touching prior-investigated surfaces.
const SYNTHESIS_SUBJECT_RE = /^(reconstruction|reconstruct|synthesis|reconciliation|reconcile|implementation|audit|discovery|inspect):/i;

// Self-attested dispatch types that should trigger the rule.
const ATTESTED_TYPES = [
  'Dispatch-type: synthesis',
  'Dispatch-type: reconstruction',
  'Dispatch-type: reconciliation',
  'Dispatch-type: implementation',
];

// File patterns that indicate the commit produced or consumed a discovery/synthesis doc.
function touchesDiscoveryArtifact(ctx) {
  // Match docs/sprint-*/...reconstruction|synthesis|discovery|reconciliation*.md
  return ctx.stagedFiles.some((f) => {
    const p = f.path.replaceAll('\\', '/');
    if (!p.startsWith('docs/')) return false;
    if (!p.endsWith('.md')) return false;
    return /(reconstruction|synthesis|discovery|reconciliation)/i.test(p);
  });
}

export const rule = {
  id: '005',
  name: 'Inference correction',
  description: 'Synthesis or reconstruction dispatches on master must include an "Inference-correction:" line stating whether prior inferences contradicted new evidence.',
  ruleSource: 'sprint-followups-discipline § Inference correction rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    if (commitSubjectMatches(ctx, SYNTHESIS_SUBJECT_RE)) return true;
    if (ATTESTED_TYPES.some((t) => commitMessageHasLine(ctx, t))) return true;
    if (touchesDiscoveryArtifact(ctx)) return true;
    return false;
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Inference-correction:');
    if (lines.length === 0) {
      return fail({
        message: 'Synthesis/reconstruction dispatch missing required "Inference-correction:" line in body.',
        remediation: [
          'Add at least one Inference-correction line stating whether prior-dispatch inferences contradicted new evidence.',
          'If a contradiction was found and corrected:',
          '  Inference-correction: <prior-dispatch-or-doc> § <claim> → <corrected fact>, evidence: <source>',
          'If the synthesis checked prior inferences and found no contradictions:',
          '  Inference-correction: no contradictions surfaced',
          'NEVER silently align downstream work to a prior inference contradicted by new evidence (see SKILL § Inference correction rule).',
        ].join('\n  '),
      });
    }

    // Substance check: each line must EITHER be the explicit no-op form
    // OR contain a "→" / "->" / "evidence:" / "corrected:" token indicating
    // a correction is being recorded. Strip the "Inference-correction:" prefix
    // first so the prefix itself does not satisfy the substance check.
    const ACCEPTABLE_BODY_RE = /(no contradictions surfaced|→|->|evidence:|corrected:)/i;
    const thin = lines.filter((line) => {
      const body = line.replace(/^Inference-correction:\s*/i, '');
      return !ACCEPTABLE_BODY_RE.test(body);
    });
    if (thin.length > 0) {
      return fail({
        message: 'Inference-correction line(s) too thin to convey state (use the no-op form or include the corrected fact + evidence).',
        remediation: [
          'Each Inference-correction line must be either:',
          '  Inference-correction: no contradictions surfaced',
          '  Inference-correction: <prior-dispatch> § <claim> → <corrected fact>, evidence: <source>',
          `Thin lines found: ${thin.map((l) => `"${l}"`).join('; ')}`,
        ].join('\n  '),
      });
    }

    return pass();
  },
};
