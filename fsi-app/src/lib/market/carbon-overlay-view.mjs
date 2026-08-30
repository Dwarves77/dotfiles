// carbon-overlay-view.mjs — the real CALLER of select-modal-factor.mjs, per WO-24 (re-scoped
// 2026-08-30). See select-modal-factor.mjs's own header for the full ruling this composes.
//
// WHY THIS FILE EXISTS SEPARATELY FROM THE SELECTOR. `MarketSignalDetailSurface.tsx`'s `DriversTab`
// needs display copy, not a bare selection result — a header string and a body string per state, plus
// (only in the `resolved` case) a formatted figure. Doing that formatting inline in the TSX component
// would mean the actual jurisdiction+mode selection logic and its consumer are proven, if at all, only by
// a live render — the exact seam-proof gap F27 exists to close (see F27's own header: two halves each
// unit-tested, the COMPOSITION between them exercised by nothing). Putting the composition in one plain
// ESM module lets a Node test import BOTH `selectModalFactor` and this file together and assert the real
// end-to-end shape, with zero React/DOM/npm dependency — the same shape
// `src/__tests__/market-producer-composition.test.mjs` uses for parser -> planner.
//
// This module is the ONLY thing `DriversTab`'s carbon-overlay slot calls. It never re-derives selection
// itself and never reaches into `factors` directly — `selectModalFactor` is the one place jurisdiction
// and mode get decided, so this file and the component can't drift from that decision.
//
// PLAIN ESM, ZERO DEPENDENCIES, PURE.

import { selectModalFactor } from "./select-modal-factor.mjs";

/**
 * @typedef {object} CarbonOverlayView
 * @property {"resolved"|"ambiguous"|"no_factor"} state
 * @property {string} header    Pending-frame eyebrow (or the resolved card's eyebrow).
 * @property {string} body      The honest, specific sentence for this state — never a generic
 *   "not available", always naming WHY (per WO-24's brief: "honest, specific copy in each case").
 * @property {{ value: number, unit: string, mode: string|null, vehicleClass: string|null,
 *   jurisdiction: string, sourceKey: string } | null} figure  Only set when `state === "resolved"`.
 *   NEVER set for any other state — this is the one place a fabricated number could leak in, and this
 *   module refuses to populate it from anything but a real `selectModalFactor` "resolved" result.
 */

/** One of ttw_co2e / wtw_co2e / wtt_co2e, in that preference order (tank-to-wheel is what a modal
 *  default typically publishes — see the two live EPA rows — falling back to well-to-wheel, then
 *  well-to-tank, so a factor that only carries one of the three still renders). Never averages or
 *  invents a number across them. */
function pickHeadlineNumber(factor) {
  if (typeof factor.ttw_co2e === "number" && Number.isFinite(factor.ttw_co2e)) {
    return { value: factor.ttw_co2e, label: "tank-to-wheel" };
  }
  if (typeof factor.wtw_co2e === "number" && Number.isFinite(factor.wtw_co2e)) {
    return { value: factor.wtw_co2e, label: "well-to-wheel" };
  }
  if (typeof factor.wtt_co2e === "number" && Number.isFinite(factor.wtt_co2e)) {
    return { value: factor.wtt_co2e, label: "well-to-tank" };
  }
  return null;
}

const BASIS_UNIT = { tonne_km: "kg CO2e / tonne-km" };

/**
 * Compose selectModalFactor's result into display copy for the carbon-overlay slot. Pure.
 *
 * @param {object} input
 * @param {unknown} input.jurisdictionIso
 * @param {import("./select-modal-factor.mjs").EmissionFactorCandidate[]} [input.factors]
 * @param {string|null} [input.mode]
 * @returns {CarbonOverlayView}
 */
export function buildCarbonOverlayView({ jurisdictionIso, factors, mode = null }) {
  const result = selectModalFactor({ jurisdictionIso, factors, mode });

  if (result.state === "resolved") {
    const headline = pickHeadlineNumber(result.factor);
    const unit = BASIS_UNIT[result.factor.quantity_basis] || `per ${result.factor.quantity_basis || "unit"}`;
    return {
      state: "resolved",
      header: "Carbon cost overlay · national modal default",
      body:
        `This is a national ${result.factor.jurisdiction} modal-default factor` +
        (result.factor.vehicle_class ? ` for ${String(result.factor.vehicle_class).replace(/_/g, " ")}` : "") +
        `, NOT a corridor-specific figure — Caro's Ledge has no corridor-level carbon data for this route ` +
        `yet (no corridor identity exists in the product today).`,
      figure: headline
        ? {
            value: headline.value,
            unit,
            mode: result.factor.mode ?? null,
            vehicleClass: result.factor.vehicle_class ?? null,
            jurisdiction: result.factor.jurisdiction,
            sourceKey: result.factor.source_key ?? null,
          }
        : null,
    };
  }

  if (result.state === "ambiguous") {
    return {
      state: "ambiguous",
      header: "Carbon cost overlay · jurisdiction spans multiple countries",
      body:
        `This signal spans multiple jurisdictions (${result.jurisdictions.join(", ")}) — no single ` +
        `national emission factor applies. Picking one would mean fabricating a corridor this signal ` +
        `never named.`,
      figure: null,
    };
  }

  // no_factor
  const reasonText = {
    empty: "This signal carries no jurisdiction to key a factor from.",
    global: `"${result.jurisdiction ?? "GLOBAL"}" is not a jurisdiction a national modal default can key off.`,
    no_match: `No emission factor is available for ${result.jurisdiction ?? "this jurisdiction"} yet.`,
    no_mode_basis:
      `${result.jurisdiction} has more than one modal-default factor (different transport modes) and ` +
      `this signal gives no basis to pick between them.`,
  }[result.reason] || `No emission factor is available for ${result.jurisdiction ?? "this jurisdiction"} yet.`;

  return {
    state: "no_factor",
    header: "Carbon cost overlay · not yet available",
    body: `${reasonText} Coverage today is limited to US road and rail modal defaults.`,
    figure: null,
  };
}
