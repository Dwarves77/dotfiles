// fueleu-annex-iv.mjs — FuelEU Maritime (Regulation (EU) 2023/1805) penalty formula, pure. Lane DP-SURF,
// system-completion train, 2026-09-02.
//
// PROVENANCE OF THE CONSTANTS AND FORMULA BELOW — READ THIS BEFORE TRUSTING A NUMBER. This lane's sandbox
// (`WebFetch` against eur-lex.europa.eu) returned ONLY page metadata/navigation for both the OJ landing
// page (`https://eur-lex.europa.eu/eli/reg/2023/1805/oj`) and the CELEX HTML/PDF endpoints
// (`https://eur-lex.europa.eu/legal-content/EN/TXT/...?uri=CELEX:32023R1805`) — the PDF fetch returned real
// regulation text (Articles up to ~23) but was truncated by the fetch tool BEFORE reaching the Annexes, so
// Annex IV's own text was never directly read this session. The formula and constants below are therefore
// **[UNCONFIRMED against the primary EUR-Lex text]** and are instead corroborated against FOUR independent
// secondary/technical sources retrieved live 2026-09-02, all of which agree on both numeric constants and
// the consecutive-year multiplier:
//   - https://www.marineinsight.com/green-shipping/how-to-calculate-fuel-eu-compliance-balance-and-fuel-eu-penalty/
//   - https://www.sustainable-ships.org/rules-regulations/fueleu
//   - https://www.globalfactor.com/en/fueleunewcompliance/
//   - https://www.intercargo.org/wp-content/uploads/2025/05/2025-May-ESSF-SAPS-WS1-FuelEU-calculation-methodologies.pdf
//     (an industry technical workshop deck citing "Annex IV Part A" for the compliance-balance formula,
//     "Annex IV Part B" for the penalty formula, and "Article 23(2)" for the consecutive-year multiplier —
//     the most specific citation found, itself UNCONFIRMED against the primary text by this lane)
// EVERY CONSTANT AND CITATION BELOW CARRIES AN EXPLICIT [UNCONFIRMED] MARKER for exactly this reason, per
// this lane's own instruction ("If you cannot fetch EUR-Lex, mark every constant [UNCONFIRMED]... do not
// invent"). Nothing here is invented — every number matches all four sources — but "four sources agree"
// is corroboration, not primary-source verification, and this file says so everywhere the number appears,
// including in the UI (StatutoryFigure renders `formulaVersion`, which carries this same caveat).

/** EUR per tonne VLSFO-equivalent. [UNCONFIRMED against primary EUR-Lex text; corroborated by 4 sources, see file header] */
export const FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE = 2400;

/** MJ per tonne VLSFO-equivalent (the lower calorific value convention). [UNCONFIRMED against primary EUR-Lex text; corroborated by 4 sources, see file header] */
export const FUELEU_VLSFOE_MJ_PER_TONNE = 41000;

/** [UNCONFIRMED against primary EUR-Lex text — see file header] */
export const FUELEU_STATUTE_CITATION =
  "Regulation (EU) 2023/1805 (FuelEU Maritime) [UNCONFIRMED], Annex IV Part A (compliance balance) & " +
  "Part B (penalty) [UNCONFIRMED — citation as reported by an ESSF/Intercargo technical workshop deck, " +
  "not read directly from the primary text]; Article 23(2) (consecutive-year multiplier) [UNCONFIRMED, same caveat]";

/** [UNCONFIRMED — OJ date reported from general knowledge, not read live this session] */
export const FUELEU_FORMULA_VERSION =
  "OJ L 234I, 22.9.2023 [UNCONFIRMED against primary EUR-Lex text this session — see file header] · " +
  "corroborated 2026-09-02 against 4 independent secondary sources";

function requireFinite(name, v) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`fueleu-annex-iv: ${name} must be a finite number (got ${JSON.stringify(v)})`);
  }
}

/**
 * Compliance balance [gCO2eq] = (GHG intensity target − GHG intensity actual) [gCO2eq/MJ] × total energy
 * used [MJ]. A positive balance is a surplus (no penalty); negative is a deficit.
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
 * The FuelEU penalty [EUR], per the four-source-corroborated formula (see file header):
 *   penalty = |complianceBalance| / (ghgIntensityActual × 41,000) × 2,400 × multiplier
 * where multiplier = 1 for a first-year deficit, 1 + (n−1)/10 for the n-th CONSECUTIVE deficit year
 * (n >= 2). Zero when the balance is a surplus (>= 0) — no penalty applies to a surplus.
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
