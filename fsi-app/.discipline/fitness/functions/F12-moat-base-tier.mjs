// F12: THE MOAT. The reg-fact grounding-tier resolver (buildResolver/resolveSpan in
// src/lib/sources/institution.ts) must derive the FACT stamp from base_tier ONLY — dynamic reputation
// (effective_tier) can neither raise nor lower it, and a NULL base_tier resolves to NULL (never filled
// in from reputation). Mechanically enforces invariant SC-9 (source-credibility-model). This guards the
// ONE-LINE regression — reintroducing `?? effective_tier` in tierOfSource (institution.ts:65-66) — that
// the corpus claims-tier audit canNOT catch, because stamp and audit both move through the same
// resolver. The behavioral selftest catches it regardless of HOW reputation leaks back in.
//
// Shape: special (whole-test), mirrors F9/F10/F11 — runs the existing self-test subprocess, passes iff
// exit 0. Defense-in-depth pairs with the grounding pipeline no longer SELECTing effective_tier into
// the resolver rows (canonical-pipeline.ts) — the value the regression would fall back to is not fetched.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const SENTINEL = 'fsi-app/src/lib/sources/institution.selftest.mjs';

export const fitnessFunction = {
  id: 'F12',
  name: 'moat-base-tier',
  description: 'Reg-fact resolver is base_tier-ONLY: reputation (effective_tier) never raises/lowers the stamp, NULL base_tier resolves to NULL, tier_override still wins. Links source-credibility-model SC-9 (the moat). Behavioral selftest fails loud on a reintroduced `?? effective_tier` fallback.',
  source: 'governance/invariants.mjs SC-9 → source-credibility-model (the moat); institution.selftest.mjs',

  enumerate() {
    return [SENTINEL];
  },

  check(filepath) {
    if (filepath !== SENTINEL) return PASS;
    const abs = join(getRepoRoot(), SENTINEL);
    if (!existsSync(abs)) {
      return [violation(1, `moat resolver self-test missing at ${SENTINEL}. Governing skill: source-credibility-model.`)];
    }
    const result = spawnSync('node', [abs], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0) return PASS;
    const tail = ((result.stdout || '') + (result.stderr || '')).split(/\r?\n/).filter(Boolean).slice(-12).map((l) => '    ' + l).join('\n');
    return [violation(1,
      `MOAT BREACH — reg-fact resolver is NOT base_tier-only (exit ${result.status}).\n${tail}\n\n` +
      `Remediation: run \`node ${SENTINEL}\`; restore tierOfSource to \`s.base_tier ?? null\` in src/lib/sources/institution.ts (no \`?? effective_tier\` fallback). Governing skill: source-credibility-model.`,
    )];
  },
};
