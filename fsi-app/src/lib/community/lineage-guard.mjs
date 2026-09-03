// lineage-guard.mjs — proves (not merely states) spec 05 §6 acceptance criteria 1 and 9 against the
// SHARED origin_class vocabulary (src/lib/contracts/vocabularies.mjs ORIGIN_CLASS, spec 00 §3.6), rather
// than re-declaring a second copy of "community is never admissible" that could drift from the vocabulary
// module. PURE. Read-only consumer of ORIGIN_CLASS — never redefines it (Addendum 26: no widening).

import { ORIGIN_CLASS } from "../contracts/vocabularies.mjs";

/**
 * @param {string} originClass
 * @returns {boolean} true iff this origin_class may enter a computed/Operations figure.
 */
export function isAdmissibleInCalculation(originClass) {
  return ORIGIN_CLASS[originClass]?.admissibleInCalculation === true;
}

/**
 * @param {string} originClass
 * @returns {boolean} true iff this origin_class may be cited as fact (by the Assistant or an export).
 */
export function isCitableAsFact(originClass) {
  return ORIGIN_CLASS[originClass]?.citableAsFact === true;
}

/**
 * Acceptance criterion 1 (spec 05 §6): "Zero `community` records reachable from any Operations figure or
 * verified aggregate." Filters a list of `{ originClass, ... }` records down to those an Operations
 * figure or aggregate is allowed to include.
 *
 * @param {Array<{ originClass: string }>} records
 * @returns {Array<{ originClass: string }>}
 */
export function filterOperationsAdmissible(records) {
  return (records ?? []).filter((r) => isAdmissibleInCalculation(r?.originClass));
}

/**
 * Acceptance criterion 9 (spec 05 §6): "The Assistant never cites a `community` record as fact." Given a
 * list of records the Assistant is about to cite, returns the ones it must refuse (community and
 * community-corroborated, currently — anything ORIGIN_CLASS marks non-citable).
 *
 * @param {Array<{ originClass: string, id?: string }>} records
 * @returns {Array<{ originClass: string, id?: string }>}
 */
export function recordsNotCitableAsFact(records) {
  return (records ?? []).filter((r) => !isCitableAsFact(r?.originClass));
}
