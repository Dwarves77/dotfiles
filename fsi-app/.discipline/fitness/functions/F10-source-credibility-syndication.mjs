// F10: The source-credibility convergence math must hold (REG-1, 2026-10-11: the former F11 trust-tier-weights and
// F12 moat-base-tier sentinels are absorbed here as facets B and C, one row for the SC math property). Mechanically links the
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

import { checkSelftest } from '../lib/selftest-spawn.mjs';

const SENTINEL_SYNDICATION = 'fsi-app/src/lib/sources/source-growth.selftest.mjs';
const SENTINEL_TRUST = 'fsi-app/src/lib/trust.selftest.mjs';
const SENTINEL_MOAT = 'fsi-app/src/lib/sources/institution.selftest.mjs';

export const fitnessFunction = {
  id: 'F10',
  name: 'source-credibility-math',
  description: 'Source-credibility math must hold, three selftests. A: syndication collapses; honest independent-citer count <= naive; trust_score_citation moves only on real corroboration (source-growth.selftest.mjs). B (formerly F11): tier weights T1=1.0 to T7=0, strictly decreasing, plus the recency-decay curve (trust.selftest.mjs). C (formerly F12): the reg-fact resolver is base_tier-ONLY, a reintroduced effective_tier fallback fails loud (institution.selftest.mjs). Links source-credibility-model SC-1, SC-3, SC-9.',
  source: 'governance/skill-map to source-credibility-model; source-growth.selftest.mjs, trust.selftest.mjs, institution.selftest.mjs',

  enumerate() {
    return [SENTINEL_SYNDICATION, SENTINEL_TRUST, SENTINEL_MOAT];
  },

  check(filepath) {
    if (filepath === SENTINEL_SYNDICATION) {
      return checkSelftest({
        id: 'F10',
        sentinel: SENTINEL_SYNDICATION,
        missingMessage: `source-credibility self-test missing at ${SENTINEL_SYNDICATION}. Governing skill: source-credibility-model.`,
        failMessage: (status) => `Source-credibility syndication-collapse math FAILED (exit ${status}).`,
        remediation: `Remediation: run node ${SENTINEL_SYNDICATION}; fix aggregateConvergence/citationScore in source-growth.ts. Governing skill: source-credibility-model.`,
      });
    }
    if (filepath === SENTINEL_TRUST) {
      return checkSelftest({
        id: 'F10',
        sentinel: SENTINEL_TRUST,
        missingMessage: `trust tier-weight self-test missing at ${SENTINEL_TRUST}. Governing skill: source-credibility-model.`,
        failMessage: (status) => `Source-credibility tier-weight / decay math FAILED (exit ${status}).`,
        remediation: `Remediation: run node ${SENTINEL_TRUST}; fix TIER_WEIGHTS / applyRecencyDecay in src/lib/trust.ts. Governing skill: source-credibility-model.`,
      });
    }
    if (filepath === SENTINEL_MOAT) {
      return checkSelftest({
        id: 'F10',
        sentinel: SENTINEL_MOAT,
        missingMessage: `moat resolver self-test missing at ${SENTINEL_MOAT}. Governing skill: source-credibility-model.`,
        failMessage: (status) => `MOAT BREACH, reg-fact resolver is NOT base_tier-only (exit ${status}).`,
        remediation: `Remediation: restore tierOfSource to s.base_tier ?? null in src/lib/sources/institution.ts (no ?? effective_tier fallback), after running node ${SENTINEL_MOAT}. Governing skill: source-credibility-model.`,
      });
    }
    return [];
  },
};
