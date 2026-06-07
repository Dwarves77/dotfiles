// F11: The source-credibility TIER WEIGHTS + recency-decay math must hold. Mechanically enforces the
// tier-weight half of invariant SC-3 (source-credibility-model §3/§4/§7) — the half that previously
// failed the operator's own rule ("buildable-but-unbuilt is not a valid exemption"). Now built.
//
// Invariants (proven by src/lib/trust.selftest.mjs against the REAL trust.ts exports):
//   (a) TIER_WEIGHTS are exactly T1=1.0, T2=0.85, T3=0.7, T4=0.5, T5=0.3, T6=0.15, T7=0 (Q7 verbatim),
//   (b) weights strictly decreasing + T7 contributes nothing,
//   (c) recency decay is the 0.5^(age/halfLife) curve,
//   (d) the citation-component path applies the weights (T1 > T5; T7-only → 0).
// Residual (honest, NOT enforced here): the effective_tier COALESCE precedence + "override never
// modifies base_tier" live in SQL (recompute job + override endpoint) — pgTAP-mechanizable, deferred.
//
// Shape: special (whole-test), mirrors F10/F9 — runs the existing self-test subprocess, passes iff exit 0.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const SENTINEL = 'fsi-app/src/lib/trust.selftest.mjs';

export const fitnessFunction = {
  id: 'F11',
  name: 'trust-tier-weights',
  description: 'Source-credibility tier weights (T1=1.0…T7=0, strictly decreasing, T7=0) + recency-decay curve must hold; the citation-component path must apply them. Links source-credibility-model SC-3 (tier-weight half).',
  source: 'governance/invariants.mjs SC-3 → source-credibility-model §3/§4/§7; trust.selftest.mjs',

  enumerate() {
    return [SENTINEL];
  },

  check(filepath) {
    if (filepath !== SENTINEL) return PASS;
    const abs = join(getRepoRoot(), SENTINEL);
    if (!existsSync(abs)) {
      return [violation(1, `trust tier-weight self-test missing at ${SENTINEL}. Governing skill: source-credibility-model.`)];
    }
    const result = spawnSync('node', [abs], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0) return PASS;
    const tail = ((result.stdout || '') + (result.stderr || '')).split(/\r?\n/).filter(Boolean).slice(-12).map((l) => '    ' + l).join('\n');
    return [violation(1,
      `Source-credibility tier-weight / decay math FAILED (exit ${result.status}).\n${tail}\n\n` +
      `Remediation: run \`node ${SENTINEL}\`; fix TIER_WEIGHTS / applyRecencyDecay in src/lib/trust.ts. Governing skill: source-credibility-model.`,
    )];
  },
};
