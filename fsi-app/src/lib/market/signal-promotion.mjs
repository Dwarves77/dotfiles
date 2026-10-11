import { ORIGIN_CLASS, citableAsFact } from "../contracts/vocabularies.mjs";

/** The four promotion states this surface distinguishes. Ordered worst (least certain) to best. */
export const PROMOTION_STATE = Object.freeze({
  unclassified: {
    code: "unclassified",
    label: "Classification pending",
    chip: "Classification pending",
    order: 1,
  },
  signal_unconfirmed: {
    code: "signal_unconfirmed",
    label: "Signal · unconfirmed",
    chip: "Unverified · early report",
    order: 2,
  },
  signal_corroborated: {
    code: "signal_corroborated",
    label: "Signal · corroborated",
    chip: "Unverified · corroborated",
    order: 3,
  },
  fact: {
    code: "fact",
    label: "Fact",
    chip: "Verified",
    order: 4,
  },
});

const MIN_CORROBORATED_CITERS = 2;

/**
 * Derive the promotion state for one market item.
 *
 * @param {{ originClass?: string|null, independentCiters?: number|null }} [input]
 *   `originClass` — one of the 7 shared ORIGIN_CLASS codes, when the mapper projects it (undefined /
 *     null today for every intelligence_items row — see this file's header). An unrecognised code is
 *     treated as the weakest signal state, never silently ignored (mirrors vocabularies.mjs's own
 *     `weakestOriginClass` fail-open rule).
 *   `independentCiters` — sources.independent_citers, already real and non-fabricated where present
 *     (MarketSignalDetailSurface's `convergence.independent_citers`, > 0 only). `null`/`undefined`/`0`
 *     all mean "no corroboration evidence", never coerced to a fabricated 1.
 * @returns {{ code:string, label:string, chip:string, basis:string, originClass:string|null,
 *   independentCiters:number|null }}
 */
export function derivePromotionState({ originClass = null, independentCiters = null } = {}) {
  const citers = typeof independentCiters === "number" && independentCiters > 0 ? independentCiters : null;

  if (originClass) {
    const known = ORIGIN_CLASS[originClass];
    if (known && citableAsFact(originClass)) {
      return { ...PROMOTION_STATE.fact, basis: "origin_class", originClass, independentCiters: citers };
    }
    // origin_class present but not fact-citable (community / community-corroborated / modelled /
    // derived), OR an unrecognised code — both are signal-side, never promoted from origin_class alone.
    if (citers !== null && citers >= MIN_CORROBORATED_CITERS) {
      return {
        ...PROMOTION_STATE.signal_corroborated,
        basis: "origin_class+corroboration",
        originClass,
        independentCiters: citers,
      };
    }
    return { ...PROMOTION_STATE.signal_unconfirmed, basis: "origin_class", originClass, independentCiters: citers };
  }

  // origin_class not yet available (today's live reality for every intelligence_items row — see this
  // file's header) — fall back to corroboration count alone. NEVER promotes to `fact`: fact requires
  // primary-source origin_class evidence this branch does not have.
  if (citers !== null && citers >= MIN_CORROBORATED_CITERS) {
    return { ...PROMOTION_STATE.signal_corroborated, basis: "corroboration", originClass: null, independentCiters: citers };
  }
  if (citers !== null) {
    return { ...PROMOTION_STATE.signal_unconfirmed, basis: "corroboration", originClass: null, independentCiters: citers };
  }
  return { ...PROMOTION_STATE.unclassified, basis: "none", originClass: null, independentCiters: null };
}
