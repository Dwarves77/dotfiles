// F23: GOVERNED-SURFACE COVERAGE RATCHET. Wires ../../governance/coverage-scan.mjs into CI and holds
// its gap counts to a committed, one-way-tightening baseline.
//
// WHY THIS EXISTS (2026-08-11, operator-directed). coverage-scan.mjs was the only module in
// .discipline/governance/ with ZERO inbound references — no import, no CI job, no runner listed it. It
// produced a real, useful gap list and ran only when a human remembered to run it. That is the same
// defect class the scan exists to detect, one level up: a mechanism that is written, correct, and not
// wired. The committed coverage-report.json had drifted 1,425 insertions / 1,170 deletions from a fresh
// run — a durable record nobody regenerates reads as current when it is not.
//
// WHY A RATCHET, NOT ZERO. There are 156 real gaps today (113 orphaned proofs, 43 ungoverned writes,
// 2 ungoverned model calls, 3 ungoverned routing). A hard-zero gate would red the build on day one and
// be disabled within a week — the standard way a gate becomes ceremony. The ratchet makes today's count
// the CEILING and every regression RED, while the existing gaps are worked down deliberately.
//
// THE RATCHET BITES BOTH WAYS. Over-baseline FAILS (new ungoverned surface). Under-baseline ALSO FAILS,
// with the value to re-seed to. A one-directional "must not exceed" check is not a ratchet: once gaps
// are fixed the slack silently reopens and the count drifts back up inside the allowance. Failing on
// improvement is what forces the ceiling down and keeps the number honest. Same shape as the
// meta-gate's MARKER BASELINE, which fails on a marker count that moves in EITHER direction.
//
// PER-CATEGORY, NOT JUST TOTAL. A single total lets 10 fixed proofs mask 10 new ungoverned writes at a
// flat total. Each category carries its own ceiling.
//
// COST: filesystem only — no network, no database, no model call, no schedule. It reads the checkout
// and returns. This adds seconds to the fitness job, not spend.
//
// Holistic, so it follows F14's shape: enumerate() returns a single sentinel and the whole-tree analysis
// runs once inside check().

import { violation } from '../lib/result.mjs';
import { runCoverageScan } from '../../governance/coverage-scan.mjs';

// Committed ceilings. Measured 2026-08-11 on master at 3dc4f54, AFTER the two detector fixes landed in
// coverage-scan.mjs (adding `insert` to WRITE_RE, which put 26 previously-invisible row-CREATING files
// on the governed surface, and stripping comments before classification, which removed the phantom
// batch-primitives model hit). Lower these as gaps are closed — the gate tells you the exact value.
export const GAP_BASELINE = {
  orphaned_proofs: 113,
  unmapped_writes: 43,
  unmapped_model: 2,
  unmapped_routing: 3,
};

const LABEL = {
  orphaned_proofs: 'ORPHANED PROOFS (a test proves something no rule or fitness function claims)',
  unmapped_writes: 'UNMAPPED WRITES (creates or mutates data with no governing skill)',
  unmapped_model: 'UNMAPPED MODEL CALLS (calls the LLM with no governing skill)',
  unmapped_routing: 'UNMAPPED ROUTING (decides what surfaces where, with no governing skill)',
};

const REMEDY = {
  orphaned_proofs: 'Reference the proof from the rule/fitness function it proves, or delete it if it proves nothing anyone relies on.',
  unmapped_writes: 'Map the file in skill-map.mjs to the skill that governs the data it writes, or record it in exemptions.mjs with a reason.',
  unmapped_model: 'Route the call through the spend chokepoint (src/lib/llm/spend-client.ts, F15), or record the disposition in exemptions.mjs with a reason.',
  unmapped_routing: 'Map the file in skill-map.mjs to the skill that governs the surface it routes to, or record it in exemptions.mjs with a reason.',
};

/**
 * Pure comparator, exported so the selftest can prove the gate's catching behaviour against constructed
 * summaries rather than the live tree — the same negative-test discipline the meta-gate uses on itself.
 * Returns an array of message strings ([] = pass).
 */
export function compareToBaseline(summary, baseline = GAP_BASELINE) {
  const problems = [];
  for (const key of Object.keys(baseline)) {
    const actual = summary[key];
    if (typeof actual !== 'number') {
      problems.push(`coverage summary is missing "${key}" — the scan's summary shape changed and this gate can no longer measure it.`);
      continue;
    }
    const ceiling = baseline[key];
    if (actual > ceiling) {
      problems.push(
        `REGRESSION — ${LABEL[key]}: ${actual}, ceiling ${ceiling} (+${actual - ceiling}). ` +
          `${REMEDY[key]} Run \`node fsi-app/.discipline/governance/coverage-scan.mjs\` for the file list. ` +
          `Raising the ceiling is not a fix; it needs a reason in the PR.`,
      );
    } else if (actual < ceiling) {
      problems.push(
        `RATCHET — ${LABEL[key]}: ${actual}, ceiling still ${ceiling}. Gaps were closed and the ceiling did not follow. ` +
          `Set GAP_BASELINE.${key} = ${actual} in F23-governed-surface-coverage.mjs so the slack cannot silently reopen.`,
      );
    }
  }
  return problems;
}

export const fitnessFunction = {
  id: 'F23',
  name: 'governed-surface-coverage',
  description:
    'The governed-surface coverage scan runs in CI and its gap counts hold to a committed, one-way-tightening baseline. Over-baseline fails (new ungoverned write / model call / routing / orphaned proof); under-baseline fails too, forcing the ceiling down. Wires coverage-scan.mjs, which had zero inbound references and ran only when a human remembered.',
  source:
    'operator ruling 2026-08-11 (promote coverage-scan.mjs to a CI gate with a ratcheting threshold); the F22 wiring audit that found it unreferenced',

  // Holistic: the whole tree is analysed once, not per-file. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.mjs'];
  },

  check() {
    const { summary } = runCoverageScan();
    return compareToBaseline(summary).map((msg) => violation(1, msg));
  },
};
