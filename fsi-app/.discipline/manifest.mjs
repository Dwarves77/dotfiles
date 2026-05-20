// Rule manifest. Main session owns this file.
// All 11 binding rules from sprint-followups-discipline are registered here.
// Wave 1 conversions (001-007, 009, 010) integrated in Wave 2 commit; Wave 0 shipped 008 + 011.

import { rule as rule001 } from './rules/001-sweep-discipline.mjs';
import { rule as rule002 } from './rules/002-source-credibility-load-trigger.mjs';
import { rule as rule003 } from './rules/003-remediation-discipline-load-trigger.mjs';
import { rule as rule004 } from './rules/004-batch-script-resilience.mjs';
import { rule as rule005 } from './rules/005-inference-correction.mjs';
import { rule as rule006 } from './rules/006-planning-doc.mjs';
import { rule as rule007 } from './rules/007-sources-schema-touch.mjs';
import { rule as rule008 } from './rules/008-dispatch-artifact-commit-summary.mjs';
import { rule as rule009 } from './rules/009-plan-skill-hybrid.mjs';
import { rule as rule010 } from './rules/010-verification-before-completion.mjs';
import { rule as rule011 } from './rules/011-inventory-artifact-emission.mjs';

export const rules = [
  rule001,
  rule002,
  rule003,
  rule004,
  rule005,
  rule006,
  rule007,
  rule008,
  rule009,
  rule010,
  rule011,
];

export function getRuleById(id) {
  return rules.find((r) => r.id === id);
}
