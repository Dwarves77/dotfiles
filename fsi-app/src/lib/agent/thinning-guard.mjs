// @ts-check
// THINNING GUARD (operator ruling 2026-07-04, "investigate before scaling"). A re-ground that DRASTICALLY
// reduces the grounded-claim count versus the prior grounding is a COVERAGE REGRESSION, not an improvement —
// even when a validation criterion happens to clear. Surfaced by the funded-pass batch 1: item 782878c0 went
// from 24 stored claims to 1 when its large (520KB, capped) pool re-extracted spans that mostly failed the
// verbatim-substring filter. groundBrief deletes the prior claims BEFORE re-extracting, so without a guard the
// thin new grounding silently replaces the rich prior one and 23 grounded facts are lost.
//
// The guard makes thinning a LOUD failure: groundBrief restores the prior claims and returns ok:false with a
// diagnostic, so the item keeps its coverage and the thinning surfaces for investigation (and re-runs next
// pass) instead of quietly degrading. Pure predicate here so the threshold is red-then-green unit-tested.

// Don't trip on tiny briefs (a 2->1 drop is noise); only guard items that carried real grounding.
export const THINNING_FLOOR = 4;

/**
 * Is the re-extracted grounding a THINNING regression versus the prior grounding? True when the prior grounding
 * had at least THINNING_FLOOR claims AND the new count collapsed to below HALF the prior. Pure.
 * @param {number} priorCount  grounded-claim count BEFORE the re-ground (snapshot before the delete)
 * @param {number} newCount    grounded-claim count the re-ground produced (kept + forced)
 * @param {number} [floor]     minimum prior count to guard (default THINNING_FLOOR)
 * @returns {boolean}
 */
export function isThinningRegression(priorCount, newCount, floor = THINNING_FLOOR) {
  const p = Number(priorCount) || 0;
  const n = Number(newCount) || 0;
  if (p < floor) return false;                 // tiny prior grounding — a drop is not a meaningful regression
  return n < Math.ceil(p / 2);                 // collapsed to below half the prior grounding
}
