// @ts-check
// FLOOR-FIRST SPAN RE-ATTRIBUTION (span-attribution unit, operator ruling 2026-07-03). Pure (no I/O), so
// the property is unit-testable red-then-green by node --test. Consumed by src/lib/agent/canonical-
// pipeline.ts groundBrief at the span->source_id resolution site (line ~808, resolver.resolveSpan).
//
// THE GAP THIS CLOSES: grounding attributes a FACT to the ONE pool URL the extractor copied its span from
// (crossLinkClaimSources -> search_result_id -> resolveSpan). When the extractor copies a legal clause from
// a sub-floor CORROBORATOR that echoes the enacted text — even though the SAME verbatim clause is also in a
// floor-qualifying source in the pool — the fact resolves to the corroborator's tier and walls on
// `fact_below_authority_floor`. The truncation moat (source-blocks.mjs) already delivers the floor source
// COMPLETE to the model; this closes the ATTRIBUTION half: prefer the floor-qualifying source when it
// verbatim-contains the span.
//
// NEVER FORCED (binding ruling 4c): re-attribution fires ONLY when the verbatim span is genuinely present
// in a floor source's fetched text. A span absent from every floor source is NOT stamped to one — it stays
// with the extractor's honest attribution (walls / relabels), never fabricated provenance. A wrong-language
// primary is the 4d case: the extractor writes the ORIGINAL-LANGUAGE span (system-prompt 4d), which then
// verbatim-matches its own-language floor source here — this helper stays language-agnostic (verbatim only).

/** @typedef {{ url: string, text: string, tier: number|null }} PoolSource */

// A FACT span shorter than this is not re-homed: too short to identify a unique legal clause, so a match
// across sources could be a coincidental fragment. A real enacted-text FACT span is a full clause well over
// this. Conservative per 4c — when in doubt, keep the extractor's attribution, never force a floor stamp.
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
