/**
 * Summary stats for a themes response — the numbers a stat-strip banner shows without a second query.
 * @param {Array<{surfaces?: string[], convergence?: number}>} themes
 * @returns {{total:number, avg_convergence:number, cross_surface_count:number, single_surface_count:number}}
 */

export function computeThemeStats(themes) {
  const list = Array.isArray(themes) ? themes : [];
  const total = list.length;
  let convergenceSum = 0;
  let crossSurfaceCount = 0;
  let singleSurfaceCount = 0;
  for (const t of list) {
    const c = typeof t?.convergence === "number" && Number.isFinite(t.convergence) ? t.convergence : 0;
    convergenceSum += c;
    const surfaceCount = Array.isArray(t?.surfaces) ? t.surfaces.length : 0;
    if (surfaceCount >= 2) crossSurfaceCount++;
    else if (surfaceCount === 1) singleSurfaceCount++;
  }
  return {
    total,
    avg_convergence: total > 0 ? Number((convergenceSum / total).toFixed(6)) : 0,
    cross_surface_count: crossSurfaceCount,
    single_surface_count: singleSurfaceCount,
  };
}

// Convergence bands for the UI's grouping (high/medium/low), same "documented heuristic, not an
// invented magic number" posture as intersections' strength bands (7/8/12 in that route's own
// comments). convergence = surfaceSpan(1-4) x density(0,1] x recency(0,1], so a cross-surface (span>=2)
// theme with meaningfully dense/recent membership clears 1.0; a single-surface theme tops out under 1
// unless density and recency are both near-max. HIGH/MEDIUM/LOW split at 1.5 / 0.5, chosen so
// "high" requires real cross-surface convergence, not just span, matching cluster.mjs's own stated
// design intent that span is the primary differentiator at equal density (see cluster.test.mjs's
// "cross-surface theme outranks same-surface" proof).
export const CONVERGENCE_BANDS = { high: 1.5, medium: 0.5 };

/**
 * Classify a theme's convergence into 'high' | 'medium' | 'low' per CONVERGENCE_BANDS.
 * @param {number} convergence
 * @returns {'high'|'medium'|'low'}
 */
export function convergenceBand(convergence) {
  const c = typeof convergence === "number" && Number.isFinite(convergence) ? convergence : 0;
  if (c >= CONVERGENCE_BANDS.high) return "high";
  if (c >= CONVERGENCE_BANDS.medium) return "medium";
  return "low";
}
