export const SUPPORTED_BASES = Object.freeze(["tonne_km"]);

const KG_TO_G = 1000;

/** Result-unit label per supported basis. Mirrors carbon-overlay-view.mjs's BASIS_UNIT (kg-denominated);
 *  this module reports the SAME basis in grams, per the task's "gCO2e per tonne-km" brief. */
const RESULT_UNIT = Object.freeze({ tonne_km: "gCO2e/tonne-km" });

/** One of ttw_co2e / wtw_co2e / wtt_co2e, in that preference order — see file header. */
function pickHeadlineKg(factor) {
  if (typeof factor.ttw_co2e === "number" && Number.isFinite(factor.ttw_co2e)) {
    return { valueKg: factor.ttw_co2e, label: "tank-to-wheel" };
  }
  if (typeof factor.wtw_co2e === "number" && Number.isFinite(factor.wtw_co2e)) {
    return { valueKg: factor.wtw_co2e, label: "well-to-wheel" };
  }
  if (typeof factor.wtt_co2e === "number" && Number.isFinite(factor.wtt_co2e)) {
    return { valueKg: factor.wtt_co2e, label: "well-to-tank" };
  }
  return null;
}

/**
 * @param {object} factor  An `emission_factors` row (or the columns this needs from one).
 * @param {string} factor.quantity_basis
 * @param {number|null} [factor.ttw_co2e]
 * @param {number|null} [factor.wtw_co2e]
 * @param {number|null} [factor.wtt_co2e]
 * @param {string} [factor.factor_id]
 * @param {string} [factor.source_key]
 * @returns {
 *   | { ok: true, valueGPerUnit: number, unit: string, basis: string, headlineLabel: string, factorId: string|null, sourceKey: string|null }
 *   | { ok: false, reason: string }
 * }
 */
export function carbonIntensity(factor) {
  if (!factor || typeof factor !== "object") {
    return { ok: false, reason: "no emission_factors row supplied" };
  }
  const basis = factor.quantity_basis;
  if (!SUPPORTED_BASES.includes(basis)) {
    return {
      ok: false,
      reason: `quantity_basis "${basis}" has no confirmed CO2e-per-unit convention in this codebase yet — only ${SUPPORTED_BASES.join(", ")} ${SUPPORTED_BASES.length === 1 ? "is" : "are"} (see carbon-overlay-view.mjs's BASIS_UNIT)`,
    };
  }
  const headline = pickHeadlineKg(factor);
  if (!headline) {
    return { ok: false, reason: "factor row carries no usable ttw_co2e/wtw_co2e/wtt_co2e number" };
  }
  return {
    ok: true,
    valueGPerUnit: headline.valueKg * KG_TO_G,
    unit: RESULT_UNIT[basis],
    basis,
    headlineLabel: headline.label,
    factorId: factor.factor_id ?? null,
    sourceKey: factor.source_key ?? null,
  };
}
