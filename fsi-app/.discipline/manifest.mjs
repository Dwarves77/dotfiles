// Rule manifest. Main session owns this file.
// Wave 1 agents: do NOT modify. Surface new rules in your dispatch report;
// main session adds the import + registration in Wave 2.

import { rule as rule008 } from './rules/008-dispatch-artifact-commit-summary.mjs';
import { rule as rule011 } from './rules/011-inventory-artifact-emission.mjs';

export const rules = [
  rule008,
  rule011,
];

export function getRuleById(id) {
  return rules.find((r) => r.id === id);
}
