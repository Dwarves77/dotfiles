// F61: chained-dry-guard-wired (lane CHAINED-DRY-GUARD, 2026-09-29, coordinator-directed). Rule 16:
// build mode (system_state.scrape_cadence='off') means every runtime fires by explicit dispatch; a
// workflow_run-chained firing is not one. [CONFIRMED live, 2026-09-29]: a hand-dispatched Source sweep
// chained into Ledger consume's own workflow_run branch, which was about to run its "chained apply"
// pass; RUN_MODE hardcoded to "apply" on every workflow_run firing across ledger-consume/
// population-turn/corpus-turn/downstream-chain/propagation-drain/gate-a-rescan/fetch-drain, with
// nothing checking build mode first. The coordinator cancelled the run by hand. scripts/lib/
// chained-dry-guard.mjs is the fix: the ONE shared gate every such workflow now calls, forcing dry
// whenever build mode is live. THIS GATE makes sure a future edit cannot quietly remove that call
// while leaving the hardcoded apply value in place.
//
// HEURISTIC, text-based (no YAML/shell parser is a direct dependency of this repository, same posture
// F50/F52/F60 already state for themselves): a workflow file that (a) has a `workflow_run:` trigger and
// (b) contains the literal string `"apply"` anywhere (a strong proxy for "this file can set some mode
// variable to apply on a chained firing") MUST ALSO reference BOTH `chained-dry-guard.mjs` (the gate is
// actually called) AND `CHAINED_FORCED_DRY` (the gate's own output is actually consulted somewhere, not
// merely invoked and ignored) in the same file. Missing either is a violation. A workflow_run-triggered
// file with no `"apply"` string at all (read-only, e.g. brief-export.yml) is not checked further, it
// has no apply path to guard.
import { violation } from '../lib/result.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';
import { extractWorkflowRunNames } from '../lib/yml-read.mjs';

const GATE_SCRIPT_MARKER = 'chained-dry-guard.mjs';
const GATE_OUTPUT_MARKER = 'CHAINED_FORCED_DRY';

export const fitnessFunction = {
  id: 'F61',
  name: 'chained-dry-guard-wired',
  description:
    'Every workflow_run-triggered workflow that can set a mode value to "apply" MUST also call ' +
    'scripts/lib/chained-dry-guard.mjs and consult its CHAINED_FORCED_DRY output, so a workflow_run- ' +
    'chained firing (never an explicit dispatch) cannot reach an apply path while build mode ' +
    '(system_state.scrape_cadence=\'off\') is live (rule 16).',
  source:
    'CLAUDE.md rule 16; docs/ops/session-log.d/2026-09-29-chained-dry-guard.md; ' +
    'live incident 2026-09-29: a chained Source sweep -> Ledger consume firing reached the chained ' +
    'apply pass and was cancelled by hand.',

  enumerate() {
    const dir = join(getRepoRoot(), '.github', 'workflows');
    let entries = [];
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.yml'));
    } catch {
      return [];
    }
    return entries.map((f) => `.github/workflows/${f}`);
  },

  check(relPath, text) {
    if (text === null || text === undefined) return [];
    const workflowRunNames = extractWorkflowRunNames(text);
    if (workflowRunNames === null) return []; // no workflow_run trigger at all, not this gate's concern
    if (!text.includes('"apply"') && !text.includes("'apply'") && !text.includes('=apply')) {
      return []; // no apply-equivalent literal anywhere -- nothing to guard (e.g. a read-only export)
    }
    const out = [];
    if (!text.includes(GATE_SCRIPT_MARKER)) {
      out.push(
        violation(
          1,
          `${relPath}: has a workflow_run trigger and can set a mode to "apply", but never calls ` +
            `${GATE_SCRIPT_MARKER}, a chained firing could reach apply while build mode is live.`,
        ),
      );
    }
    if (!text.includes(GATE_OUTPUT_MARKER)) {
      out.push(
        violation(
          1,
          `${relPath}: has a workflow_run trigger and can set a mode to "apply", but never reads ` +
            `${GATE_OUTPUT_MARKER}, the gate may be called but its answer is never consulted.`,
        ),
      );
    }
    return out;
  },
};
