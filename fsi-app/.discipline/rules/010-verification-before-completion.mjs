// Rule 010: Verification-before-completion required
// Source: sprint-followups-discipline § Verification-before-completion required rule
//
// Trigger: every applicable commit on master (universal per the skill text:
//          "Load on every dispatch regardless of size or count"). Skip trivial
//          commits (<=1 file AND <=5 additions) and the same skip-types as rule 008
//          (investigation-only, hotfix, research-only, conversation-only, merge, revert).
// Check:   commit body contains a "Verification:" line with at least one verification
//          command and observation. Trivial verification lines (e.g. "Verification: done")
//          FAIL with a remediation hint requesting specifics.

import { pass, fail, skip } from '../lib/result.mjs';
import {
  isApplicableDispatchType,
  commitMessageLines,
} from '../lib/predicates.mjs';

// Minimum characters required after "Verification:" prefix for the line to count
// as substantive. "done", "ok", "passed" etc. all fall below this threshold and
// fail. A real verification line includes a command name plus an observation
// (e.g. "ran tsc; observed zero errors" = 32 chars), so 20 is a safe floor.
const MIN_VERIFICATION_DETAIL_CHARS = 20;

// Tokens that signal a verification command or observation was named. At least
// one must appear in the verification line content for it to pass the substance
// check. The list intentionally covers schema, code, runtime, and observation
// vocabulary so the rule is not narrowly tied to one tech stack.
const VERIFICATION_SUBSTANCE_TOKENS = [
  'ran ', 'observed ', 'returned ', 'confirmed ', 'output', 'exit',
  'psql', 'tsc', 'test', 'node ', 'curl', 'select ', 'git log',
  'screenshot', 'smoke', 'verified', 'queried', 'lint',
];

function isSubstantiveVerificationLine(rest) {
  if (!rest) return false;
  const trimmed = rest.trim();
  if (trimmed.length < MIN_VERIFICATION_DETAIL_CHARS) return false;
  const lower = trimmed.toLowerCase();
  return VERIFICATION_SUBSTANCE_TOKENS.some((tok) => lower.includes(tok));
}

export const rule = {
  id: '010',
  name: 'Verification-before-completion required',
  description: 'Every applicable commit on master must include a substantive "Verification:" line in the body.',
  ruleSource: 'sprint-followups-discipline § Verification-before-completion required rule',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    // Trivial commits (single file, tiny diff) do not owe verification
    if (ctx.totalFilesChanged <= 1 && ctx.totalAdditions <= 5) return false;
    return true;
  },

  check(ctx) {
    const lines = commitMessageLines(ctx, 'Verification:');
    if (lines.length === 0) {
      return fail({
        message: 'Commit body missing required "Verification:" line.',
        remediation: [
          'Add a Verification line citing at least one command and the observed result.',
          'Format: Verification: ran <command>; observed <result>',
          'Examples:',
          '  Verification: ran `npx tsc --noEmit`; observed zero errors',
          '  Verification: ran `psql -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'sources\'"`; observed effective_tier present',
          '  Verification: ran `node --test fsi-app/.discipline/**/*.test.mjs`; observed all suites pass',
          'If verification cannot be performed in the dispatch context, state so explicitly and route to the operator: "Verification: cannot verify in dispatch; operator to confirm via X"',
        ].join('\n  '),
      });
    }

    const substantive = lines.some((line) => {
      // Strip the "Verification:" prefix and any single trailing space; whatever
      // remains is the body of the claim being asserted.
      const rest = line.slice('Verification:'.length);
      return isSubstantiveVerificationLine(rest);
    });

    if (!substantive) {
      return fail({
        message: 'Verification line(s) present but lack substance (need a command + observation).',
        remediation: [
          'A Verification line must cite at least one command and an observation.',
          'Trivial claims like "Verification: done" or "Verification: passed" do NOT satisfy the rule.',
          'Format: Verification: ran <command>; observed <result>',
          `Lines found: ${lines.map((l) => `"${l}"`).join(', ')}`,
        ].join('\n  '),
      });
    }

    return pass();
  },
};

export const skipReasons = {
  notOnMaster: 'verification audit-trail rule applies to commits landing on master only',
  notApplicableType: 'commit subject indicates investigation, hotfix, research, conversation, merge, or revert',
  trivial: 'commit too small (single file, <=5 additions) to owe a verification artifact',
};
