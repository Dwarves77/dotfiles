// F10: The source-credibility convergence math must hold. Mechanically links the
// source-credibility-model skill (previously NONE — judgment-load only) per the operating-mechanism
// build (fold #2: all six skills linked, not four).
//
// Invariants (proven by src/lib/sources/source-growth.selftest.mjs):
//   (a) syndicated republications collapse to ONE corroboration (3 sites -> 1),
//   (b) the honest independent-citer count is <= the naive count, and
//   (c) trust_score_citation moves 0 -> >0 only on real corroboration.
// If the syndication-collapse / independent-citer math regresses (e.g. naive distinct-citer counting
// re-inflates trust), this gate FAILS. This is enforcement against code, not ceremony.
//
// Shape: special (whole-test), mirrors F9 — a sentinel enumerate + one check() that runs the
// existing self-test subprocess and passes iff it exits 0.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const SENTINEL = 'fsi-app/src/lib/sources/source-growth.selftest.mjs';

export const fitnessFunction = {
  id: 'F10',
  name: 'source-credibility-syndication-collapse',
  description: 'Source-credibility convergence math must hold (syndication collapses; honest independent-citer count <= naive; trust_score_citation moves only on real corroboration). Links source-credibility-model.',
  source: 'governance/skill-map → source-credibility-model; source-growth.selftest.mjs',

  enumerate() {
    return [SENTINEL];
  },

  check(filepath) {
    if (filepath !== SENTINEL) return PASS;
    const abs = join(getRepoRoot(), SENTINEL);
    if (!existsSync(abs)) {
      return [violation(1, `source-credibility self-test missing at ${SENTINEL}. Governing skill: source-credibility-model.`)];
    }
    const result = spawnSync('node', [abs], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0) return PASS;
    const tail = ((result.stdout || '') + (result.stderr || '')).split(/\r?\n/).filter(Boolean).slice(-12).map((l) => '    ' + l).join('\n');
    return [violation(1,
      `Source-credibility syndication-collapse math FAILED (exit ${result.status}).\n${tail}\n\n` +
      `Remediation: run \`node ${SENTINEL}\`; fix aggregateConvergence/citationScore in source-growth.ts. Governing skill: source-credibility-model.`,
    )];
  },
};
