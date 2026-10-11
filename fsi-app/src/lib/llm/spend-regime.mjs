// @ts-check
/** @typedef {'build-phase'|'steady-state'} SpendRegime */

export const SPEND_REGIME = /** @type {SpendRegime} */ (process.env.SPEND_REGIME || "build-phase");

const IS_BUILD_PHASE = SPEND_REGIME === "build-phase";

/** Under BUILD-PHASE, a standing dollar/pace figure NEVER gates — it is information-only. A guard asks this
 *  before treating any standing default as a limit: true ⇒ report it as info/finding, never halt on it.
 *  (STEADY-STATE, once defined at Unit-5, may re-enable specific standing policies by ruling.) */
export function standingFiguresAreInformationOnly() {
  return IS_BUILD_PHASE;
}

// ── WIRING (2026-08-11, module-liveness sweep) ───────────────────────────────────────────────────────
// This module was DOCTRINE WITH NO IMPORTER for four weeks, and `SPEND_REGIME` is a DEPLOYED Vercel env
// var (dormant-systems audit 2026-07-18, item 9). That combination is worse than dead code: it is a
// control surface that LIES. Setting SPEND_REGIME=steady-state in production changed nothing, because
// nothing read it — the operator would have believed a regime flip had taken effect while every paid call
// carried on under build-phase rules. The retirement of standing figures was implemented by HARD-CODING
// build-phase behaviour into spend-guard.assertBudget (`void standingCeilingUsd`), which is correct
// behaviour reached without consulting the regime that authorizes it.
//
// assertBudget now calls assertRegimeDefined() before any spend, so the switch means what it says.

class SpendRegimeError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'SpendRegimeError'; }
}

/**
 * Refuse to authorize paid work under a regime whose policy does not exist.
 *
 * FAILS CLOSED, and that is the point. STEADY-STATE is declared above as "not yet defined" — its pace
 * policy and delegated-pricing rules are Unit-5 work that has not been done. Silently applying build-phase
 * rules to a flag that says steady-state would be the same lie one level down: the operator flips the
 * switch, sees no error, and reasonably concludes the steady-state policy is in force. Throwing stops
 * spend rather than mis-authorizing it, and a typo'd value ("Build-Phase", "prod") is refused for the
 * same reason — an unrecognized regime is an unauthorized one.
 */
export function assertRegimeDefined() {
  if (SPEND_REGIME === 'build-phase') return;
  throw new SpendRegimeError(
    `SPEND_REGIME="${SPEND_REGIME}" does not name a defined regime. BUILD-PHASE is the only regime whose ` +
      `policy exists; STEADY-STATE (pace policy, delegated pricing) is declared-but-undefined pending the ` +
      `coverage-floor / Unit-5 work. Refusing to authorize paid work under an undefined regime — set ` +
      `SPEND_REGIME=build-phase, or define the regime before flipping to it.`,
  );
}
