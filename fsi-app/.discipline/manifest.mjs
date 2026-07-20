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
// Operating-mechanism build (2026-06-06): content-verifier tripwires for the three damage
// action-classes (G/S/M). These VERIFY AGAINST CODE (012-style), not trailer-attestation —
// the manifest's own 5e3ae41 lesson ("ceremony rather than enforcement") rules out attestation
// gates. Each maps to a governing skill via governance/skill-map.mjs (single source of truth).
import { rule as rule015 } from './rules/015-row-mutation-guarded-path.mjs';
import { rule as rule016 } from './rules/016-canonical-anthropic-path.mjs';
import { rule as rule017 } from './rules/017-generation-config-no-raw-env.mjs';
import { rule as rule018 } from './rules/018-new-surface-five-model.mjs';
// Source-registration invariant (2026-06-06): source-not-item must be REGISTERED, never raw-archived
// (the 25-orphan + 5-wrong-archive class fix). Pairs with db.mjs reclassifyToSource() + migration 135.
import { rule as rule019 } from './rules/019-source-reclassify-not-archive.mjs';
// Fork-log guard (2026-07-20): the deprecated fsi-app/docs/ops/session-log.md fork is frozen —
// reject any commit that ADDS content to it (four recorded fork-write instances; the advisory
// header alone kept failing). Maps to invariant SW-2 (the divergence-register recommendation).
import { rule as rule020 } from './rules/020-fork-log-frozen.mjs';

export const rules = [
  rule012,
  rule014,
  rule015,
  rule016,
  rule017,
  rule018,
  rule019,
  rule020,
];

export function getRuleById(id) {
  return rules.find((r) => r.id === id);
}
