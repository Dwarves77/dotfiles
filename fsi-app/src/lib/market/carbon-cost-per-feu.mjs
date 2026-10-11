import { carbonIntensity } from "./carbon-intensity.mjs";
import { isContractable, isStatutory, DERIVATIONS } from "../contracts/envelope.mjs";
import { UNCERTAINTY_PCT } from "../figures/uncertainty.mjs";

export { UNCERTAINTY_PCT };

/** Named gap reasons — stable strings a caller (CarbonCostOverlay.tsx) can render or key off, never a
 *  freshly-composed sentence per call site drifting out of sync with this module's own logic. */
export const GAP = Object.freeze({
  NO_FACTOR: "no emission factor supplied for this corridor's mode",
  NO_DISTANCE: "no corridor routing distance available yet (no licence-clear distance dataset in this product today)",
  NO_PAYLOAD: "no cited tonnes-per-FEU payload convention available (GLEC and ISO 14083 are both licence-prohibited; no substitute is registered)",
  NO_CARBON_PRICE: "no EU ETS/FuelEU/CBAM/UKA carbon-price input in market_series yet (eex-eua producer unimplemented)",
});

const CLASSIFICATIONS = Object.freeze(["statutory", "derived", "estimate"]);

function assertDerivation(fieldName, derivation) {
  if (!DERIVATIONS.includes(derivation)) {
    throw new Error(
      `carbon-cost-per-feu: ${fieldName} must be one of ${DERIVATIONS.join(", ")} (got ${JSON.stringify(derivation)})`,
    );
  }
}

/** A value present without its own provenance is exactly the defect envelope.mjs exists to make
 *  unconstructable (this file's own header). `value` may legitimately be null (an honest GAP); it may
 *  NOT be a number with no derivation/basis — that is a caller bug, not a data gap, so this throws rather
 *  than silently rendering an unlabelled number. `valueName`/`derivationName`/`basisName` are the ACTUAL
 *  input-object field names (e.g. "distanceKm"/"distanceDerivation"/"distanceBasis"), so a thrown message
 *  always names a field the caller can find on the input object it passed — never a concatenation that
 *  does not exist on the API surface. */
function requireProvenance(valueName, value, derivation, basis, derivationName, basisName) {
  if (value === null || value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`carbon-cost-per-feu: ${valueName} must be a finite number or null (got ${JSON.stringify(value)})`);
  }
  assertDerivation(derivationName, derivation);
  if (!basis || typeof basis !== "string" || !basis.trim()) {
    throw new Error(`carbon-cost-per-feu: ${valueName}=${value} was supplied with no ${basisName} citation — every number carries its provenance`);
  }
}

/** Scenario low/high multiplier for one input, given its own derivation. A contractable input (observed,
 *  calculated, a published rate) never gets a second-guessed band; only a non-contractable one
 *  (interpolated/modelled/estimated) varies by ±UNCERTAINTY_PCT — see file header. */
function band(value, derivation) {
  if (isContractable(derivation)) return { low: value, high: value };
  return { low: value * (1 - UNCERTAINTY_PCT), high: value * (1 + UNCERTAINTY_PCT) };
}

/**
 * @param {object} input
 * @param {{origin: string, dest: string, mode: string}} input.corridor  The UN/LOCODE-pair+mode identity
 *   (ADR-024 §4 / CORRIDOR_ID_SCHEME, src/lib/entities/decisions.mjs) this figure is FOR. Carried through
 *   to the result untouched — this module never mints or validates a `cl:corridor:*` id itself (that is
 *   entityId()/corridorSeed()'s job, scripts/entities/seed-corridors.mjs's own concern).
 * @param {object|null} input.factor  An `emission_factors` row (migration 258 shape) whose `quantity_basis`
 *   is `tonne_km` and whose mode matches `corridor.mode` — the caller's job to select (this module does
 *   not query a table). `null` when no factor covers this corridor's mode yet.
 * @param {number|null} input.distanceKm
 * @param {string} [input.distanceDerivation]  One of envelope.mjs's nine DERIVATIONS. Required whenever
 *   `distanceKm` is not null.
 * @param {string} [input.distanceBasis]  Citation. Required whenever `distanceKm` is not null.
 * @param {number|null} input.payloadTonnesPerFeu
 * @param {string} [input.payloadDerivation]
 * @param {string} [input.payloadBasis]
 * @param {{value: number, currency: string, sourceKey: string, asOf: string|null, derivation: string, basis: string}|null} input.carbonPrice
 *   EUR (or stated currency) per tonne CO2e. `null` when `market_series` carries none yet (today: always).
 * @returns {
 *   | { ok: true, corridor: object, unit: "FEU", currency: string, low: number, point: number, high: number,
 *       classification: "statutory"|"derived"|"estimate", intensity: object, distanceKm: number,
 *       distanceBasis: string, payloadTonnesPerFeu: number, payloadBasis: string, carbonPrice: object, gaps: [] }
 *   | { ok: false, corridor: object, gaps: string[], partial: object }
 * }
 */
export function carbonCostPerFeu(input) {
  const {
    corridor,
    factor = null,
    distanceKm = null,
    distanceDerivation = null,
    distanceBasis = null,
    payloadTonnesPerFeu = null,
    payloadDerivation = null,
    payloadBasis = null,
    carbonPrice = null,
  } = input || {};

  if (!corridor || !corridor.origin || !corridor.dest || !corridor.mode) {
    throw new Error("carbon-cost-per-feu: input.corridor = { origin, dest, mode } is required");
  }

  requireProvenance("distanceKm", distanceKm, distanceDerivation, distanceBasis, "distanceDerivation", "distanceBasis");
  requireProvenance("payloadTonnesPerFeu", payloadTonnesPerFeu, payloadDerivation, payloadBasis, "payloadDerivation", "payloadBasis");
  if (carbonPrice !== null) {
    requireProvenance("carbonPrice.value", carbonPrice.value, carbonPrice.derivation, carbonPrice.basis, "carbonPrice.derivation", "carbonPrice.basis");
    if (!carbonPrice.currency) throw new Error("carbon-cost-per-feu: carbonPrice.currency is required whenever carbonPrice is supplied");
  }

  const gaps = [];
  let intensity = null;
  if (!factor) {
    gaps.push(GAP.NO_FACTOR);
  } else {
    const r = carbonIntensity(factor);
    if (!r.ok) gaps.push(`${GAP.NO_FACTOR} (${r.reason})`);
    else intensity = r;
  }
  if (distanceKm === null) gaps.push(GAP.NO_DISTANCE);
  if (payloadTonnesPerFeu === null) gaps.push(GAP.NO_PAYLOAD);
  if (carbonPrice === null) gaps.push(GAP.NO_CARBON_PRICE);

  const partial = {
    intensity,
    distanceKm, distanceBasis,
    payloadTonnesPerFeu, payloadBasis,
    carbonPrice,
  };

  if (gaps.length > 0) {
    return { ok: false, corridor, gaps, partial };
  }

  // ── every input present — compute ────────────────────────────────────────────────────────────────
  const distanceBand = band(distanceKm, distanceDerivation);
  const payloadBand = band(payloadTonnesPerFeu, payloadDerivation);
  const priceBand = band(carbonPrice.value, carbonPrice.derivation);

  // gCO2e/tonne-km -> kg/tonne-km -> kg CO2e for one FEU's payload over the corridor -> tonnes CO2e ->
  // cost. The factor itself carries no published low/high (migration 258 stores one number per row), so
  // no band is invented for it here — only the three caller-supplied assumptions vary.
  const scenario = (dKm, pTonnes, priceVal) => {
    const kgPerTonneKm = intensity.valueGPerUnit / 1000;
    const totalKgCo2e = kgPerTonneKm * pTonnes * dKm;
    const totalTonnesCo2e = totalKgCo2e / 1000;
    return totalTonnesCo2e * priceVal;
  };

  const point = scenario(distanceKm, payloadTonnesPerFeu, carbonPrice.value);
  const low = scenario(distanceBand.low, payloadBand.low, priceBand.low);
  const high = scenario(distanceBand.high, payloadBand.high, priceBand.high);

  const derivations = [factor.derivation, distanceDerivation, payloadDerivation, carbonPrice.derivation];
  const classification = derivations.every(isStatutory)
    ? "statutory"
    : derivations.every(isContractable)
      ? "derived"
      : "estimate";

  return {
    ok: true,
    corridor,
    unit: "FEU",
    currency: carbonPrice.currency,
    low, point, high,
    classification,
    intensity,
    distanceKm, distanceBasis,
    payloadTonnesPerFeu, payloadBasis,
    carbonPrice,
    gaps: [],
  };
}

export { CLASSIFICATIONS };
