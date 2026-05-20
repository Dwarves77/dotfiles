// Rule 006: Planning-doc skill-closed scope check
// Source: sprint-followups-discipline § Planning-doc rule: skill-closed scope is NOT an operator decision point
//
// Trigger: commits on master that add or modify a planning doc. Detected by
//          file patterns:
//            - docs/sprint-*/planning*.md
//            - docs/sprint-*/*planning*.md
//            - docs/sprint-*/*sprint-plan*.md
//            - docs/sprint-*/*plan*.md
//            - docs/plans/**.md  (per Plan-skill hybrid rule, 9th binding rule)
//          OR self-attested "Dispatch-type: planning".
// Check:   commit body contains a line beginning with "Planning-doc:" stating
//          that every operator decision point in the planning doc was checked
//          against the relevant skill section and confirmed to be operator-open
//          (not skill-closed). Two acceptable forms:
//            (a) "Planning-doc: skill-scope verified for D-N decisions; cites caros-ledge-platform-intent §..."
//                used when decision points exist; names how many and which skill closed-vs-open verification
//                was performed against.
//            (b) "Planning-doc: no operator decision points (single-path build per skill)"
//                used when the planning doc presents only skill-defined single-path builds.
//
// The discipline engine cannot read the planning doc and verify that no
// skill-closed scope was reopened. The attestation forces the planning author
// to make the check explicit; operator + reviewer verify the substance.

import { pass, fail } from '../lib/result.mjs';
import {
  commitMessageHasLine,
  commitMessageLines,
  hasFileMatching,
  filesMatching,
} from '../lib/predicates.mjs';

// Conservative detector for "is this a planning doc file?"
function isPlanningDocPath(path) {
  const p = path.replaceAll('\\', '/');
  if (!p.endsWith('.md')) return false;
  // docs/plans/** (per Plan-skill hybrid rule)
  if (p.startsWith('docs/plans/')) return true;
  // docs/sprint-N/...plan*.md or ...planning*.md or ...sprint-plan*.md
  if (/^docs\/sprint-[^/]+\/.*(planning|sprint-plan|-plan-|^plan|\/plan)/i.test(p)) return true;
  // simpler: any docs/sprint-*/... file whose basename contains "plan"
  const m = p.match(/^docs\/sprint-[^/]+\/(.+)$/);
  if (m && /plan/i.test(m[1])) return true;
  return false;
}

function touchedPlanningDocs(ctx) {
  return ctx.stagedFiles.filter((f) => isPlanningDocPath(f.path));
}

export const rule = {
  id: '006',
  name: 'Planning-doc skill-scope verification',
  description: 'Commits touching planning docs on master must include a "Planning-doc:" line attesting that every operator decision point respects skill-closed scope.',
  ruleSource: 'sprint-followups-discipline § Planning-doc rule: skill-closed scope is NOT an operator decision point',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    if (touchedPlanningDocs(ctx).length > 0) return true;
    if (commitMessageHasLine(ctx, 'Dispatch-type: planning')) return true;
    return false;
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Planning-doc:');
    if (lines.length === 0) {
      const touched = touchedPlanningDocs(ctx);
      const touchedList = touched.length > 0
        ? touched.map((f) => f.path).join(', ')
        : '(self-attested planning dispatch)';
      return fail({
        message: 'Planning-doc commit missing required "Planning-doc:" line attesting skill-scope verification.',
        remediation: [
          'Add a Planning-doc line confirming every operator decision point in the doc was checked against the relevant skill section(s) for skill-closed scope.',
          'Acceptable forms:',
          '  Planning-doc: skill-scope verified for D-N decisions; cites <skill> § <section>',
          '  Planning-doc: no operator decision points (single-path build per skill)',
          'Skill-closed scope CANNOT be reopened as a planning-layer decision (see SKILL § Planning-doc rule).',
          `Planning files touched: ${touchedList}`,
        ].join('\n  '),
      });
    }

    // Substance check: line must either declare a count of decisions reviewed,
    // declare none exist, or cite a skill section.
    const SUBSTANCE_RE = /(skill-scope verified|no operator decision points|skill[- ]closed|§|cites |per skill)/i;
    const thin = lines.filter((line) => !SUBSTANCE_RE.test(line));
    if (thin.length > 0) {
      return fail({
        message: 'Planning-doc line(s) too thin to convey skill-scope verification.',
        remediation: [
          'Each Planning-doc line must reference skill-scope verification (cite the skill + section) or declare no operator decision points.',
          'Examples:',
          '  Planning-doc: skill-scope verified for D7, D14 decisions; cites caros-ledge-platform-intent § 3, § 4',
          '  Planning-doc: no operator decision points (single-path build per caros-ledge-platform-intent § 3)',
          `Thin lines found: ${thin.map((l) => `"${l}"`).join('; ')}`,
        ].join('\n  '),
      });
    }

    return pass();
  },
};

// Exported for unit tests of the path detector.
export const _isPlanningDocPath = isPlanningDocPath;
