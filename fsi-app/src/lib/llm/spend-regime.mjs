// @ts-check
// SPEND REGIME (operator ruling 2026-07-15). The single config home for WHICH spend regime governs the
// platform's paid work. The regime is switched DELIBERATELY, by ruling — never by default.
//
//   BUILD-PHASE (current) — build/remediation work. NO pace guards, NO daily/rate targets, NO floors, NO
//     standing dollar figures of any kind govern build work. The ONLY three controls are the real ones,
//     all already built:
//       a. AUTHORIZATION — work runs under an operator go: a bound where the operator writes one, or an
//          OPEN authorization where the work class is ruled (e.g. free URL-presence registrations, SC-13).
//       b. INTEGRITY — the structural guards that prevent WASTE (not speed): holdings-gate (never buy what
//          we hold), one-pass, dominance guard (never destroy good work), no-gain tripwire (spending-
//          without-effect halts), the spend ticket + drained-ledger invariant.
//       c. MEASUREMENT — spend-watch as PURE ACCOUNTING: every paid row traceable (priced-line marker) +
//          posture-carrying; actuals reported per item/class/model; cost-shape anomalies (a $5 item in a
//          $0.40 class) surfaced as FINDINGS, never as blocks.
//
//   STEADY-STATE (not yet defined) — pace policy, delegated-pricing rules. DEFINED in the coverage-floor /
//     Unit-5 work and switches on at cadence-flip, deliberately by ruling. Until then it does not exist as
//     an active posture; nothing should silently evaluate a steady-state default against build work.
//
// Retro-check corollary (2026-07-15): any steady-state standing dollar/pace figure (monthly ceiling, per-item
// circuit breaker, daily cap, standing SPEND_CEILING, cooldown) MUST be information-only under BUILD-PHASE — it
// may be READ for display/findings, but it MUST NOT gate or halt a paid call. The sole dollar gate is the
// operator-priced line (assertPricedSpend). See docs/ops/build-phase-spend-regime-2026-07-15.md for the sweep.

/** @typedef {'build-phase'|'steady-state'} SpendRegime */

/** The active regime. Switched only by ruling (env override for a deliberate flip; default = build-phase). */
export const SPEND_REGIME = /** @type {SpendRegime} */ (process.env.SPEND_REGIME || "build-phase");

export const IS_BUILD_PHASE = SPEND_REGIME === "build-phase";

/** Under BUILD-PHASE, a standing dollar/pace figure NEVER gates — it is information-only. A guard asks this
 *  before treating any standing default as a limit: true ⇒ report it as info/finding, never halt on it.
 *  (STEADY-STATE, once defined at Unit-5, may re-enable specific standing policies by ruling.) */
export function standingFiguresAreInformationOnly() {
  return IS_BUILD_PHASE;
}
