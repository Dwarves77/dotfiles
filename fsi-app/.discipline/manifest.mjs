// Rule manifest. Main session owns this file.
//
// Post-slim (2026-05-21 audit): the engine was cut from 14 rules to 2 rules.
// Deleted rules 001-011 + 013 per evidence-based audit (zero catches in ~23h
// live, structurally same shape as the reverted rule 015 — attestation gates
// the engine cannot verify against code). The operator's published 5e3ae41
// revert rationale was the load-bearing precedent: "ceremony rather than
// enforcement."
//
// REMAINING (2):
//   Rule 012 — hardcoded user-home path (content check; caught REPO_ROOT residual instance)
//   Rule 014 — inventory consistency (gates Layer 4 C-check subsystem; caught migration 067)
//
// Commit messages return to normal: subject + body, no required trailers.
// Loop-closure, Skill-loaded, Verification, ADR-Reference, Inventory-emission
// are all OPTIONAL going forward. The pre-push hook (installed via
// install-hooks.mjs) is the new CI-parity gate.

import { rule as rule012 } from './rules/012-hardcoded-user-path.mjs';
import { rule as rule014 } from './rules/014-inventory-consistency.mjs';

export const rules = [
  rule012,
  rule014,
];

export function getRuleById(id) {
  return rules.find((r) => r.id === id);
}
