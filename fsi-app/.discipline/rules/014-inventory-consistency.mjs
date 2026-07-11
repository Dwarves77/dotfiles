// Rule 014: Inventory consistency required.
// Source: sprint-followups-discipline § Inventory consistency rule + ADR-005 (Layer 4).
//
// Trigger: any commit on master (not merge/revert) that modifies docs/inventories/*.md files.
// Check:   full consistency runner must exit 0 on the resulting state.
// Override: `Consistency-Override: C-N (rationale: ...; remediation-deadline: YYYY-MM-DD)` trailer.
//
// The check is shell-shaped: rather than re-running the full consistency runner inline
// (which would slow commit-msg hook to ~5-10s), this rule asserts that the operator has
// run the consistency runner before committing AND that the resulting state is clean.
// Implementation: invoke the consistency runner in a subprocess; pass if exit 0.

import { pass, fail, skip } from '../lib/result.mjs';
import { isApplicableDispatchType, hasFileMatching } from '../lib/predicates.mjs';
import { runConsistencyRunner, evaluate } from '../consistency/override-check.mjs';

export const rule = {
  id: '014',
  name: 'Inventory consistency',
  description: 'Commits modifying docs/inventories/*.md must satisfy the consistency runner (10 C-checks) on the resulting state. Override via Consistency-Override: trailer.',
  ruleSource: 'sprint-followups-discipline § Inventory consistency rule + ADR-005 (Layer 4)',

  trigger(ctx) {
    if (!ctx.isOnMaster) return false;
    if (!isApplicableDispatchType(ctx)) return false;
    // Trigger only on inventory file changes
    return hasFileMatching(ctx, 'docs/inventories/');
  },

  check(ctx) {
    // Run the consistency runner + evaluate against Consistency-Override trailers via the SHARED
    // primitive (override-check.mjs) — the ONE home for the override vocabulary (also used by the
    // pre-push hook and the always-on CI backstop job, so the three can never drift). A VALID
    // override requires a non-empty rationale AND a today-or-future remediation-deadline.
    const result = runConsistencyRunner();

    if (result.status === 0) return pass();
    if (result.status === 2) {
      return fail({
        message: 'Consistency runner errored (exit 2) — engine failure, not drift.',
        remediation: `Reproduce: node fsi-app/.discipline/consistency/runner.mjs\n  ${(result.stderr || '').split(/\r?\n/).slice(0, 20).join('\n  ')}`,
      });
    }

    const messages = [ctx.commitMessage || ctx.commitBody || ''];
    const verdict = evaluate({ runnerStatus: result.status, stderr: result.stderr, messages });
    if (verdict.ok) return pass();

    // Capture full stderr drift detail (bounded; no aggressive filtering that
    // dropped the actual "claims X but file does not exist" detail line).
    const driftLines = result.stderr
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .slice(0, 80);

    return fail({
      message: `Consistency runner failed (exit ${result.status}); ${verdict.uncovered.length} check(s) have no valid override: ${verdict.uncovered.join(', ')}.`,
      remediation: [
        'Either fix the drift (recommended) or add a Consistency-Override trailer per failing check.',
        'Drift detail captured from runner stderr:',
        ...driftLines.map((l) => '    ' + l),
        'To reproduce locally: run `node fsi-app/.discipline/consistency/runner.mjs`',
        'Override format: `Consistency-Override: C-N (rationale: <non-empty text>; remediation-deadline: YYYY-MM-DD)`',
        'The remediation-deadline must be a future date by which the drift will be fixed.',
      ].join('\n  '),
    });
  },
};
