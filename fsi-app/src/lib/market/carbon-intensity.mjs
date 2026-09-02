// carbon-intensity.mjs — gCO2e-per-unit carbon intensity from a single `emission_factors` row. Lane
// DP-SURF, system-completion train, 2026-09-02.
//
// PURE, ZERO DEPENDENCIES. Neither statutory (no formula prescribed by law — this is a unit-conversion of
// a factor the source already published) nor an estimate (no model, no uncertainty band — the factor row
// IS the number, converted to a customer-legible unit). `derivation: "calculated"`, `origin_class:
// "derived"` (docs/specs/08-flywheel-design.md §2.3 worked example: "Market Intel: carbon-cost-per-FEU on
// 11 corridors" is exactly this shape, one factor row narrower). Rendered through a plain derived-value
// display, never `<StatutoryFigure>` — see `DerivedFigure`, exported alongside `EstimatedFigure` from
// src/components/figures/EstimatedFigure.tsx (that file's own header explains why a third rendering lives
// there rather than in a fourth component file this lane's write set does not name).
//
// UNIT CONVENTION — REUSES, DOES NOT REINVENT. `src/lib/market/carbon-overlay-view.mjs`'s `BASIS_UNIT`
// already establishes the ONE confirmed convention in this codebase: `emission_factors.quantity_basis =
// 'tonne_km'` means the stored wtt/ttw/wtw_co2e numbers are `kg CO2e / tonne-km` (that file's own
// constant, unit-tested by its callers). Every other `quantity_basis` value the schema's own CHECK admits
// (`vehicle_km`, `teu_km`, `tonne`, `litre`, `kg`, `kwh`, `mj` — migration 258
// `emission_factors_quantity_basis`) has NO documented kg-CO2e-per-unit convention anywhere in this
// codebase today — inventing one here would be exactly the fabricated-precision failure ADR-024 and spec
// §4's isolation design exist to prevent. So: `tonne_km` is SUPPORTED; every other basis REFUSES with a
// named reason, honestly reporting the gap rather than guessing a unit label.
//
// HEADLINE-NUMBER PREFERENCE mirrors carbon-overlay-view.mjs's `pickHeadlineNumber()` exactly (tank-to-
// wheel preferred — "what a modal default typically publishes" — falling back to well-to-wheel, then
// well-to-tank), so the SAME factor row never reports two different headline numbers on two different
// surfaces. Not imported directly (that function is module-private there) — replicated here at three
// lines, with this note as the drift guard: if carbon-overlay-view.mjs's preference order ever changes,
// this file's tests will disagree with it and must be updated together.

/** The one quantity_basis this module has a confirmed CO2e-per-unit convention for. */
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
