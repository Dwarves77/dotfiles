// Rule manifest. Main session owns this file.
// Rules 001-011 are attestation rules: they read the commit message and
// staged file paths to verify the dispatch followed sprint-followups-discipline.
// Rule 012 is the first CONTENT-CHECK rule: it reads the actual bytes of
// staged code files to catch hardcoded user-home paths mechanically.
//
// Architecture note: rule 012 lives in the same engine as the attestation rules
// (Option A from the OBS-59 dispatch). Operator's long-term preference is Option B
// (split attestation vs content into separate systems) because the conceptual
// distinction is real and content checks will likely grow. Option A was chosen
// for THIS commit because: (1) work already built before the operator's lean was
// expressed, (2) local commit-msg hook coverage so devs catch the pattern pre-push
// (Option B is CI-only by default), (3) one rule does not yet justify a second system.
//
// MIGRATION TRIGGER: when content-check rules reach 2+ entries (rule 013 land, or
// rule 012 grows new patterns that don't fit), extract rules tagged
// `category: 'content'` into a separate `.lint/` directory with its own CI workflow
// and a thin local-hook wrapper. Each rule module already encapsulates trigger +
// check, so the migration is mechanical: move the file, update the manifest, point
// the runner-or-replacement at the new directory. Tracked in OBS-59 follow-ups.

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
import { rule as rule012 } from './rules/012-hardcoded-user-path.mjs';
import { rule as rule013 } from './rules/013-adr-cross-reference.mjs';
import { rule as rule014 } from './rules/014-inventory-consistency.mjs';
import { rule as rule015 } from './rules/015-post-push-verification.mjs';

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
  rule012,
  rule013,
  rule014,
  rule015,
];

export function getRuleById(id) {
  return rules.find((r) => r.id === id);
}
