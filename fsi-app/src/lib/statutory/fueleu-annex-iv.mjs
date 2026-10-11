export const FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE = 2400;

/** MJ per tonne VLSFO-equivalent (Annex IV Part B(a), row 5/6 — the lower calorific value convention). CONFIRMED — see file header. */
export const FUELEU_VLSFOE_MJ_PER_TONNE = 41000;

/** CONFIRMED — see file header. Covers Part A(a) and Part B(a) only; Part B(b) (RFNBO) is not implemented — see computeFuelEuPenaltyRfnbo. */
export const FUELEU_STATUTE_CITATION =
  "Regulation (EU) 2023/1805, Annex IV Part A(a) and Part B(a); Article 23(2). Verified against EUR-Lex " +
  "CELEX:32023R1805 on 2026-09-02 (coordinator, browser read).";

/** CONFIRMED — see file header. */
export const FUELEU_FORMULA_VERSION = "OJ L 234, 22.9.2023 — verified against EUR-Lex CELEX:32023R1805 on 2026-09-02";

/** Named, non-guessed gap: Annex IV Part B(b)'s RFNBO sub-target penalty is not implemented (see file header). */
export const FUELEU_RFNBO_NOT_IMPLEMENTED_REASON =
  "Annex IV Part B(b) (RFNBO sub-target penalty, using CB_RFNBO and Pd — the RFNBO/fossil-fuel price " +
  "difference) is not implemented: neither this module's original secondary sources nor the 2026-09-02 " +
  "primary-text read established Pd's definition, units or reference price with enough confidence to " +
  "implement without guessing a number. Named as a gap, not guessed.";

function requireFinite(name, v) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`fueleu-annex-iv: ${name} must be a finite number (got ${JSON.stringify(v)})`);
  }
}

/**
 * Compliance balance [gCO2eq] = (GHG intensity target − GHG intensity actual) [gCO2eq/MJ] × total energy
 * used [MJ] — Annex IV Part A(a), CONFIRMED (see file header). A positive balance is a surplus (no
 * penalty); negative is a deficit. `energyUsedMJ` is Part A(a)'s bracketed term
 * `Σ_i M_i × LCV_i + Σ_k E_k` (fuel mass × lower calorific value, summed over fuels, plus other onboard
 * energy) — a caller-supplied total; this module does not decompose it from a fuel mix (no LCV table
 * exists here to do so).
 * @param {object} p
 * @param {number} p.ghgIntensityTargetGco2ePerMJ
 * @param {number} p.ghgIntensityActualGco2ePerMJ
 * @param {number} p.energyUsedMJ
 * @returns {number} complianceBalanceGco2eq
 */
export function computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ, ghgIntensityActualGco2ePerMJ, energyUsedMJ }) {
  requireFinite("ghgIntensityTargetGco2ePerMJ", ghgIntensityTargetGco2ePerMJ);
  requireFinite("ghgIntensityActualGco2ePerMJ", ghgIntensityActualGco2ePerMJ);
  requireFinite("energyUsedMJ", energyUsedMJ);
  if (energyUsedMJ < 0) throw new Error(`fueleu-annex-iv: energyUsedMJ must be >= 0 (got ${energyUsedMJ})`);
  return (ghgIntensityTargetGco2ePerMJ - ghgIntensityActualGco2ePerMJ) * energyUsedMJ;
}

/**
 * The FuelEU penalty [EUR] — Annex IV Part B(a) + Article 23(2), CONFIRMED (see file header):
 *   penalty = |complianceBalance| / (ghgIntensityActual × 41,000) × 2,400 × multiplier
 * Unit chain, spelled out: complianceBalance is gCO2eq, ghgIntensityActual is gCO2eq/MJ, so
 * |complianceBalance| / ghgIntensityActual is MJ; dividing by 41,000 (MJ per tonne VLSFOe) yields
 * `vlsfoeDeficitTonnes`; multiplying by 2,400 (EUR per tonne VLSFOe) yields EUR. multiplier = 1 for a
 * first-year deficit, 1 + (n−1)/10 for the n-th CONSECUTIVE deficit year (n >= 2, Article 23(2), verbatim).
 * Zero when the balance is a surplus (>= 0) — no penalty applies to a surplus. Part A(a) only (the fossil
 * GHG-intensity target) — Part B(b)'s RFNBO sub-target penalty is a separate, NOT IMPLEMENTED calculation
 * (see computeFuelEuPenaltyRfnbo below and the file header).
 * @param {object} p
 * @param {number} p.complianceBalanceGco2eq  From computeComplianceBalance(), or supplied directly.
 * @param {number} p.ghgIntensityActualGco2ePerMJ  Must be > 0 (it is a denominator).
 * @param {number} [p.consecutiveYears]  n >= 1. Default 1 (no consecutive-year surcharge).
 * @returns {{ penaltyEur: number, isDeficit: boolean, vlsfoeDeficitTonnes: number, multiplier: number }}
 */
export function computeFuelEuPenalty({ complianceBalanceGco2eq, ghgIntensityActualGco2ePerMJ, consecutiveYears = 1 }) {
  requireFinite("complianceBalanceGco2eq", complianceBalanceGco2eq);
  requireFinite("ghgIntensityActualGco2ePerMJ", ghgIntensityActualGco2ePerMJ);
  if (ghgIntensityActualGco2ePerMJ <= 0) {
    throw new Error(`fueleu-annex-iv: ghgIntensityActualGco2ePerMJ must be > 0 (got ${ghgIntensityActualGco2ePerMJ})`);
  }
  if (!Number.isInteger(consecutiveYears) || consecutiveYears < 1) {
    throw new Error(`fueleu-annex-iv: consecutiveYears must be a positive integer (got ${JSON.stringify(consecutiveYears)})`);
  }

  const isDeficit = complianceBalanceGco2eq < 0;
  if (!isDeficit) {
    return { penaltyEur: 0, isDeficit: false, vlsfoeDeficitTonnes: 0, multiplier: 1 };
  }

  const multiplier = consecutiveYears >= 2 ? 1 + (consecutiveYears - 1) / 10 : 1;
  const vlsfoeDeficitTonnes = Math.abs(complianceBalanceGco2eq) / (ghgIntensityActualGco2ePerMJ * FUELEU_VLSFOE_MJ_PER_TONNE);
  const penaltyEur = vlsfoeDeficitTonnes * FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE * multiplier;

  return { penaltyEur, isDeficit: true, vlsfoeDeficitTonnes, multiplier };
}

/**
 * Annex IV Part B(b) — the RFNBO sub-target penalty. NOT IMPLEMENTED — see FUELEU_RFNBO_NOT_IMPLEMENTED_REASON
 * and the file header. Always throws. Exists so a caller reaching for "the other FuelEU penalty" finds a
 * named, explained gap instead of silently getting Part B(a)'s fossil-target answer mislabeled, and so a
 * future implementation has one obvious place to land once Pd is confirmed.
 * Deliberately takes no parameters — the input shape is not yet known with confidence (see reason).
 * @returns {never}
 */
export function computeFuelEuPenaltyRfnbo() {
  throw new Error(`fueleu-annex-iv: computeFuelEuPenaltyRfnbo is not implemented — ${FUELEU_RFNBO_NOT_IMPLEMENTED_REASON}`);
}
