// Rule 011: Inventory-artifact emission
// Source: sprint-followups-discipline § Inventory-artifact emission rule
//
// Trigger: substantial dispatch landing on master (any type; this rule does not skip hotfix/etc.
//          IF the hotfix touches an inventory surface, but for v1 we use the same applicability
//          gate as rule 008 to keep behavior consistent with the skill's "When to Apply" skip set).
// Check:   commit body contains at least one "Inventory-emission:" line AND the lines collectively
//          cover every inventory surface the commit touched (per touchedInventorySurfaces).

import { pass, fail, skip } from '../lib/result.mjs';
import {
  isSubstantialDispatch,
  isApplicableDispatchType,
  commitMessageHasLine,
  commitMessageLines,
  touchedInventorySurfaces,
} from '../lib/predicates.mjs';

export const rule = {
  id: '011',
  name: 'Inventory-artifact emission',
  description: 'Substantial dispatch commits on master must include "Inventory-emission:" line(s) covering every touched inventory surface.',
  ruleSource: 'sprint-followups-discipline § Inventory-artifact emission rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    if (!isSubstantialDispatch(ctx)) return false;
    return true;
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Inventory-emission:');
    if (lines.length === 0) {
      return fail({
        message: 'Substantial dispatch commit missing required "Inventory-emission:" line(s) in body.',
        remediation: [
          'Add one Inventory-emission line per inventory touched.',
          'Format: Inventory-emission: docs/inventories/<type>.md +N entries (description)',
          'Use "no changes" when the dispatch touches the surface but no inventory entry changes.',
        ].join('\n  '),
      });
    }

    const touched = touchedInventorySurfaces(ctx);
    if (touched.length === 0) {
      // Inventory line present, no specific surface touched. Acceptable.
      return pass();
    }

    const missing = touched.filter((surface) => !lines.some((line) => line.includes(`inventories/${surface}.md`)));
    if (missing.length > 0) {
      return fail({
        message: `Inventory-emission lines do not cover all touched inventory surfaces. Missing: ${missing.join(', ')}.`,
        remediation: [
          'For each touched surface, add an Inventory-emission line referencing the corresponding inventory file.',
          `Touched surfaces in this commit: ${touched.join(', ')}.`,
          `Currently covered in commit body: ${touched.filter((s) => !missing.includes(s)).join(', ') || '(none)'}.`,
        ].join('\n  '),
      });
    }

    return pass();
  },
};
