// carbon-cost-per-feu.mjs — spec-02 §6 item 3: "Carbon cost overlay on the freight rate: EUA × maritime
// phase-in, ETS2, CBAM, UKA, expressed as cost per FEU per corridor, not EUR/tCO2e. The differentiating
// component." Lane CORR, wave 2, system-completion train, 2026-09-02.
//
// WHY THIS MODULE CAN EXIST NOW AND COULD NOT BEFORE. carbon-overlay-view.mjs's own header (this lane
// found it unmodified — that file is not in this lane's write set) says it plainly: "Caro's Ledge has no
// corridor-level carbon data for this route yet (no corridor identity exists in the product today)."
// This lane builds corridor identity (scripts/entities/seed-corridors.mjs, ADR-024 §4). This module is
// the FIRST consumer of that identity for the one thing spec 02 names as "the single most defensible
// 'only we do this' component available to us": a per-corridor cost, not a bare EUR/tCO2e price.
//
// PURE, ZERO DEPENDENCIES beyond two already-shared, already-tested modules in this codebase — reused,
// never re-derived, per this codebase's "one home, many consumers" discipline:
//   - carbonIntensity() (./carbon-intensity.mjs) for the emission_factors -> gCO2e/tonne-km conversion.
//     The SAME conversion the derived-value pipeline uses (methods/carbon-intensity.ts), so a factor row
//     never reads two different intensities on two different surfaces.
//   - isContractable()/isStatutory() (../contracts/envelope.mjs DERIVATION) for the statutory/estimate
//     classification. Migration 286's Layer 3 (assert_statutory_purity) enforces the SAME rule at the DB
//     layer for a different table (statutory_computations): "an estimate is never presented as
//     statutory." This module has no DB write path (COMMON lane contract: nothing here touches the
//     database) so it re-implements the identical WEAKEST-LINK rule at the pure-function layer, sourced
//     from the SAME nine-class DERIVATION vocabulary migration 286's own Layer 2 (types.ts Contractable)
//     already uses — not a second, drifting copy of the rule, the same rule read from its one home.
//
// THE THREE-WAY CLASSIFICATION FALLS OUT OF isStatutory()/isContractable(), IT IS NOT INVENTED HERE:
//   'statutory' — every input's derivation isStatutory() (statutory_fixed/statutory_formula). A published
//                 formula end to end. Renders through StatutoryFigure.tsx's vocabulary (this module does
//                 not import that component — CarbonCostOverlay.tsx, this lane's own component, is the
//                 renderer — but the CLASSIFICATION LABEL matches its badge name on purpose).
//   'derived'   — every input isContractable() (deterministic: observed/calculated/etc, no genuine model
//                 uncertainty) but not every input is statutory. Matches DerivedFigure's own definition
//                 (EstimatedFigure.tsx header: "neither statutory nor estimated... a deterministic
//                 conversion of a published factor"), never a range for this case (see UNCERTAINTY below).
//   'estimate'  — at least one input's derivation is NOT contractable (interpolated/modelled/estimated).
//                 ADR-024 decision 2 (ESTIMATE_DISPLAY="range", src/lib/entities/decisions.mjs): never a
//                 bare point once any input is an estimate — the whole result renders low/point/high.
//
// UNCERTAINTY BAND. `UNCERTAINTY_PCT` is imported from ../operations/automate-vs-hire.mjs, NOT redefined
// here — that file's own header names it "an EXPLICIT, DOCUMENTED convention... the generic 'a national
// wage/price series moved since it was published' margin nowhere else more precisely quantified in the
// corpus today," and re-typing 0.10 a third time in this codebase is exactly the drifting-copy defect
// that file itself was written to avoid for the automate-vs-hire case. Applied ONLY to an input whose
// derivation is not contractable (a genuine assumption this module cannot itself verify) — a
// contractable input (observed, calculated, a published rate) is held FIXED at its own value for low and
// high, never second-guessed with an invented band on top of a real number. Because distance, payload and
// price all increase cost MONOTONICALLY in the SAME direction (unlike automate-vs-hire's wage/energy,
// which pull net cash flow in opposite directions), low pairs every input's low value and high pairs
// every input's high value — no cross-pairing is needed here.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT SUPPLY, AND WHY (never fabricated, always a named GAP):
//   - Corridor routing distance. No licence-clear distance-by-UN/LOCODE-pair dataset exists in this
//     codebase today (checked: no `distance`/`great-circle`/`nga_wpi` table or module anywhere under
//     src/scripts; NGA WPI itself is a live registered source, migration 258, but this lane's write set
//     does not include a distance producer). The caller supplies `distanceKm` with its own provenance;
//     omitting it is a GAP, never an assumed number.
//   - Tonnes of cargo per FEU (needed to turn a WEIGHT-based intensity, kg CO2e/tonne-km, into a
//     PER-CONTAINER cost). The two licence-clear conversion tables that would normally carry this
//     (GLEC Framework, EN ISO 14083) are BOTH `prohibited` in migration 258's data_sources register
//     (`glec_framework`, `iso_14083` — "No use... for resale or any other commercial purpose", "single
//     registered end-user licence"). No substitute publishes one. The caller supplies
//     `payloadTonnesPerFeu` with its own provenance; omitting it is a GAP, never an invented industry
//     rule of thumb.
//   - An EU ETS / FuelEU / CBAM / UKA carbon-price input. `market_series`'s `eex-eua` producer is an
//     undocumented stub (src/lib/market/series-registry.mjs, `implemented: false`) — zero live rows.
//     The caller supplies `carbonPrice` when `market_series` carries one; omitting it is a GAP.
// Every one of the three is therefore an honest, expected GAP against today's live data — this module's
// job is to be READY the moment any one of them lands (a distance producer, a licence-clear payload
// convention, or the eex-eua producer), computing a real number with no further code change here.
//
// PLAIN ESM, ZERO NPM DEPENDENCIES. No I/O, no clock — same posture as carbon-intensity.mjs and
// automate-vs-hire.mjs.

import { carbonIntensity } from "./carbon-intensity.mjs";
import { isContractable, isStatutory, DERIVATIONS } from "../contracts/envelope.mjs";
import { UNCERTAINTY_PCT } from "../operations/automate-vs-hire.mjs";

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
