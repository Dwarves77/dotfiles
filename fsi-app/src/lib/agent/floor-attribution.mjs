// @ts-check
/** @typedef {{ url: string, text: string, tier: number|null }} PoolSource */

export const MIN_REATTRIB_SPAN = 24;

/**
 * Floor-qualifying sources from the pool, best-tier-first (lowest tier number). Pure.
 * @param {PoolSource[]} pool
 * @param {number|null} floorTier
 * @returns {PoolSource[]}
 */
export function floorSources(pool, floorTier) {
  if (floorTier == null) return [];
  return pool
    .filter((s) => s.tier != null && s.tier <= floorTier)
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
}

/**
 * Decide floor-first re-attribution for a FACT span. Returns the floor source whose fetched text VERBATIM
 * contains the span (best-tier-first), or null when none does. Fires ONLY when the current attribution is
 * BELOW the floor (or unresolved) — a span already at/above the floor keeps its attribution (no needless
 * re-point). null on: exempt type (floorTier null), too-short span, or verbatim-absent from every floor
 * source (4c: never forced).
 * @param {string|null|undefined} span
 * @param {number|null} currentTier  tier of the extractor-chosen source (null = unregistered host)
 * @param {PoolSource[]} ordered     floor-qualifying sources, best-tier-first (from floorSources)
 * @param {number|null} floorTier
 * @returns {PoolSource|null}
 */
export function reattributeToFloor(span, currentTier, ordered, floorTier) {
  if (floorTier == null) return null;                                 // exempt item type — nothing to enforce
  if (currentTier != null && currentTier <= floorTier) return null;   // already clears the floor
  const needle = String(span ?? "").toLowerCase().trim();
  if (needle.length < MIN_REATTRIB_SPAN) return null;                 // too short to home safely (4c)
  for (const s of ordered) {
    if (String(s.text ?? "").toLowerCase().includes(needle)) return s; // verbatim present -> honest re-home
  }
  return null;                                                        // 4c: absent everywhere -> honest wall
}
