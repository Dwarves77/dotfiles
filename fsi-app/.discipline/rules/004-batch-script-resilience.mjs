// Rule 004: Batch-script resilience
// Source: sprint-followups-discipline § Batch-script resilience rule
//
// Trigger: commit adds or modifies a batch script under fsi-app/scripts/**/*.mjs,
//   excluding fsi-app/scripts/lib/ (the primitives library itself) and fsi-app/scripts/tmp/.
//   Trivial edits (combined additions + deletions <= 5) skip the check.
//
// Check: each changed batch script path is mentioned in a "Batch-resilience:" body line
//   that either documents which batch-primitives are consumed OR explains why the library
//   does not apply (e.g. Supabase client instead of pg.Pool).
//
// Format:
//   Batch-resilience: <script-path> consumes withRetry+createPgPool+isAnthropicRetryable
//   Batch-resilience: <script-path> deferred (uses Supabase client; library does not fit)

import { pass, fail, skip } from '../lib/result.mjs';
import {
  commitMessageLines,
  filesMatching,
} from '../lib/predicates.mjs';

// Returns the list of batch-script files in this commit that this rule cares about.
// Excludes the library itself and tmp scripts. Filters out trivial edits.
function changedBatchScripts(ctx) {
  return filesMatching(ctx, 'fsi-app/scripts/').filter((f) => {
    // Only .mjs files
    if (!f.path.endsWith('.mjs')) return false;
    // Exclude the primitives library itself
    if (f.path.startsWith('fsi-app/scripts/lib/')) return false;
    // Exclude tmp scratch scripts
    if (f.path.startsWith('fsi-app/scripts/tmp/')) return false;
    // Exclude trivial changes (comment-only edits, etc.)
    const churn = (f.additions || 0) + (f.deletions || 0);
    if (churn <= 5) return false;
    return true;
  });
}

export const rule = {
  id: '004',
  name: 'Batch-script resilience',
  description: 'Batch scripts under fsi-app/scripts/ must document batch-primitives consumption via a Batch-resilience: commit-body line.',
  ruleSource: 'sprint-followups-discipline § Batch-script resilience rule',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return changedBatchScripts(ctx).length > 0;
  },

  check(ctx) {
    const scripts = changedBatchScripts(ctx);
    const lines = commitMessageLines(ctx, 'Batch-resilience:');

    if (lines.length === 0) {
      return fail({
        message: 'Batch-script commit missing required "Batch-resilience:" line(s) in body.',
        remediation: [
          'Add one Batch-resilience line per changed batch script (under fsi-app/scripts/).',
          'Format A (library consumed):',
          '  Batch-resilience: <script-path> consumes withRetry+createPgPool+isAnthropicRetryable',
          'Format B (library does not apply):',
          '  Batch-resilience: <script-path> deferred (uses Supabase client; library does not fit)',
          'Library lives at fsi-app/scripts/lib/batch-primitives.mjs.',
          `Scripts in this commit owing coverage: ${scripts.map((f) => f.path).join(', ')}`,
        ].join('\n  '),
      });
    }

    const missing = scripts.filter((f) => !lines.some((line) => line.includes(f.path)));
    if (missing.length > 0) {
      const missingPaths = missing.map((f) => f.path).join(', ');
      const coveredPaths = scripts
        .filter((f) => !missing.includes(f))
        .map((f) => f.path)
        .join(', ') || '(none)';
      return fail({
        message: `Batch-resilience lines do not cover all changed batch scripts. Missing: ${missingPaths}.`,
        remediation: [
          'For each uncovered script, add a Batch-resilience line referencing the exact script path.',
          `Already covered in commit body: ${coveredPaths}.`,
          'Format A: Batch-resilience: <script-path> consumes <primitive>+<primitive>',
          'Format B: Batch-resilience: <script-path> deferred (<reason library does not apply>)',
        ].join('\n  '),
      });
    }

    return pass();
  },
};
