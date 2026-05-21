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

import { spawnSync } from 'node:child_process';
import { pass, fail, skip } from '../lib/result.mjs';
import { isApplicableDispatchType, commitMessageLines, hasFileMatching } from '../lib/predicates.mjs';
import { getRepoRoot } from '../lib/context.mjs';
import { join } from 'node:path';

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
    // Run the consistency runner; check exit code.
    const runnerPath = join(getRepoRoot(), 'fsi-app/.discipline/consistency/runner.mjs');
    const result = spawnSync('node', [runnerPath, '--quiet'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0) return pass();

    // Check for Consistency-Override trailers that document any drift
    const overrideLines = commitMessageLines(ctx, 'Consistency-Override:');
    const overriddenChecks = new Set();
    for (const line of overrideLines) {
      const m = line.match(/Consistency-Override:\s*(C-?\d+)\s*\(rationale:\s*[^;]+;\s*remediation-deadline:\s*\d{4}-\d{2}-\d{2}\)/);
      if (m) overriddenChecks.add(m[1].replace('-', ''));
    }

    // Parse runner output for failing check IDs
    const failingChecks = new Set();
    const driftPattern = /\[C(\d+)\]/g;
    let m;
    while ((m = driftPattern.exec(result.stdout + result.stderr)) !== null) {
      failingChecks.add('C' + m[1]);
    }

    // If every failing check has an override, pass
    const uncoveredFails = [...failingChecks].filter((c) => !overriddenChecks.has(c));
    if (uncoveredFails.length === 0 && failingChecks.size > 0) return pass();

    return fail({
      message: `Consistency runner failed (exit ${result.status}); ${uncoveredFails.length} check(s) have no override: ${uncoveredFails.join(', ')}.`,
      remediation: [
        'Either fix the drift (recommended) or add a Consistency-Override trailer per failing check.',
        'Fix: run `node fsi-app/.discipline/consistency/runner.mjs` locally to see drift records; address them.',
        'Override format: `Consistency-Override: C-N (rationale: <non-empty text>; remediation-deadline: YYYY-MM-DD)`',
        'The remediation-deadline must be a future date by which the drift will be fixed.',
        'Override usage surfaces in audit; recurring overrides on the same check indicate a deeper issue.',
      ].join('\n  '),
    });
  },
};
