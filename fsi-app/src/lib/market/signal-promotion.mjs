// signal-promotion.mjs — Lane SURF, spec 02 §2 ("Signal versus fact") and §6 item 4 ("Signal feed with
// promotion state: signal/fact, corroboration count, ICD-203 confidence, first-seen, last-movement,
// promotion timestamp") and §9's named defect:
//
//   "Partial. An 'Unverified' chip exists but is unconditional (isSignalType = !!r.type, and the mapper
//   defaults type to 'uncertain'), so a verified regulation opened here renders labelled Unverified. An
//   epistemic-integrity inversion."
//
// THE DEFECT, PRECISELY. `!!r.type` is a truthiness check on a field the mapper (rpcRowToResource /
// fetchIntelligenceItemUncached, src/lib/supabase-server.ts) NEVER leaves falsy — an absent item_type is
// defaulted to the string "uncertain", which is itself truthy. The chip therefore renders on every item,
// unconditionally, regardless of what the item actually is. This module replaces that always-true check
// with a state derived from REAL evidence about promotion maturity.
//
// WHAT EVIDENCE IS ACTUALLY AVAILABLE TODAY, READ HONESTLY. `intelligence_items.origin_class` exists
// (migration 267) but carries ZERO backfilled rows [confirmed in that migration's own verification
// block: "SELECT count(*) FROM intelligence_items WHERE origin_class IS NOT NULL; -- 0 (no backfill
// yet)"], and none of the category-routed mappers (`rpcRowToResource`, `fetchIntelligenceItemUncached`)
// project it onto `Resource` yet — extending them is a `src/lib/supabase-server.ts` change, outside this
// lane's write set (see this lane's own report for the exact line to add). `independent_citers` (real,
// non-fabricated corroboration count from `sources.independent_citers`) IS already threaded through to
// the detail page as `convergence.independent_citers` — that is real, live evidence this module can use
// today. This module therefore accepts `originClass` as an optional, FORWARD-COMPATIBLE input (undefined
// today, real the day the mapper projects it) and treats `independentCiters` as the load-bearing signal
// available now — never inventing a promotion the corroboration count alone cannot support.
//
// THE ONE RULE THAT MATTERS: CORROBORATION NEVER PROMOTES TO FACT BY ITSELF. Spec §2's own example is
// explicit — "[SIGNAL] Corroboration: 2 independent ... → promotes to [FACT] on primary-source
// confirmation" — corroboration is a SIGNAL-side property; only a primary-source-backed origin_class
// (verified/official/partner — DERIVATION.contractable / ORIGIN_CLASS.citableAsFact in the shared
// vocabulary) may promote a card to FACT. Ten corroborating trade-press pickups are still a signal.
//
// PLAIN ESM, ZERO DEPENDENCIES beyond the shared vocabulary (vocabularies.mjs) — imported, never
// duplicated, per this lane's own instructions.

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
