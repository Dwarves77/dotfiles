// Rule 013: ADR cross-reference required.
// Source: sprint-followups-discipline § ADR cross-reference rule + ADR-009 (ADR system architecture).
//
// Trigger: any commit on master (not merge/revert) that stages files matching
//          one or more accepted ADRs' scope globs.
// Check:   commit body contains either:
//            ADR-Reference: ADR-NNN     (for each intersecting ADR), OR
//            ADR-Override: ADR-NNN (rationale: <non-empty>)  (explicit contradiction)
//          for every intersecting ADR.

import { pass, fail, skip } from '../lib/result.mjs';
import { isApplicableDispatchType, commitMessageLines } from '../lib/predicates.mjs';
import { listAcceptedAdrs, findIntersectingAdrs } from '../lib/adr-loader.mjs';

export const rule = {
  id: '013',
  name: 'ADR cross-reference',
  description: 'Commits whose staged files intersect accepted ADR scope must reference each intersecting ADR via ADR-Reference: or ADR-Override: trailer.',
  ruleSource: 'sprint-followups-discipline § ADR cross-reference rule + ADR-009',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    const adrs = listAcceptedAdrs();
    if (adrs.length === 0) return false;
    const stagedPaths = ctx.stagedFiles.map((f) => f.path);
    return findIntersectingAdrs(stagedPaths, adrs).length > 0;
  },

  check(ctx) {
    const adrs = listAcceptedAdrs();
    const stagedPaths = ctx.stagedFiles.map((f) => f.path);
    const intersecting = findIntersectingAdrs(stagedPaths, adrs);

    if (intersecting.length === 0) return pass();

    const referenceLines = commitMessageLines(ctx, 'ADR-Reference:');
    const overrideLines = commitMessageLines(ctx, 'ADR-Override:');

    // Extract ADR-NNN ids from each kind of line
    const referencedIds = new Set();
    for (const line of referenceLines) {
      const m = line.match(/ADR-Reference:\s*(ADR-\d{3})/);
      if (m) referencedIds.add(m[1]);
    }
    const overriddenIds = new Set();
    for (const line of overrideLines) {
      const m = line.match(/ADR-Override:\s*(ADR-\d{3})\s*\(rationale:\s*([^)]+)\)/);
      if (m && m[2].trim().length > 0) overriddenIds.add(m[1]);
    }

    const coveredIds = new Set([...referencedIds, ...overriddenIds]);
    const missing = intersecting.filter((adr) => !coveredIds.has(adr.id));

    if (missing.length === 0) return pass();

    return fail({
      message: `Commit touches files in the scope of ${missing.length} accepted ADR(s); missing ADR-Reference: or ADR-Override: trailer for: ${missing.map((a) => a.id).join(', ')}.`,
      remediation: [
        'For each intersecting ADR, add a trailer line to the commit body:',
        '    ADR-Reference: ADR-NNN',
        '  OR (for explicit contradiction):',
        '    ADR-Override: ADR-NNN (rationale: <non-empty explanation>)',
        '',
        'Intersecting ADRs:',
        ...missing.map((adr) => `    ${adr.id}: ${adr.title}  (scope: ${adr.scope.slice(0, 3).join(', ')}${adr.scope.length > 3 ? '...' : ''})`),
        '',
        'Override surfaces in audit via dispatch UUID and is logged for future operator review.',
      ].join('\n  '),
    });
  },
};
