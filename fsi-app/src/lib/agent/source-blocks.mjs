// @ts-check
// TIER-ORDERED synthesis/grounding block builder + the per-item-type authority floor. Pure (no I/O), so
// the MOAT PROPERTY is unit-testable red-then-green by node --test. Consumed by src/lib/agent/canonical-
// pipeline.ts (both synthesis R1 and grounding R2 call it over the SAME pool/budget/tiers → identical
// window = the span-grounding coupling).
//
// THE MOAT (operator ruling 2026-07-03): any source that qualifies the item's authority floor
// (tier <= floorTier) reaches the model COMPLETE, never truncated — so a FACT is matchable in its
// floor-qualifying source and grounds AT the floor, not to a sub-floor corroborator. Truncation pressure is
// TIER-ORDERED: floor-qualifiers first, in full; the remaining budget is shared by the rest lowest-tier-
// first. A floor-qualifying source larger than hardCeiling is the (rare) chunking case — NOT silently
// sliced; returned as a `ceilingWall` the caller surfaces (truncation-guard flag + item stays quarantined).
// This REPLACED the prior order-based builder (fetched[0] = "primary") whose non-tier-ordered corroborator
// split truncated a floor-qualifying T2 that happened not to be fetched[0] → the fact_below_authority_floor
// wall (Lane-#4 batch-1, 2026-07-03).

/** @typedef {{ url: string, text: string, tier: number|null }} SourceForBlock */
/** @typedef {{ url: string, collected: number, fullLength: number, cap: number, transport: string }} TruncEvent */

/**
 * The per-item-type AUTHORITY FLOOR: the max tier number a CRITICAL/HIGH item's FACT claims may ground to.
 * A source at/above it (tier <= floor) is floor-qualifying. market_signal / initiative / regional_data are
 * floor-EXEMPT → null.
 *
 * ONE HOME (SC-10 / operator ruling 2026-07-03): the RUNTIME AUTHORITY for the floor is the audit's
 * `validate_item_provenance` (migration 141, the `v_floor_max` CASE) — the same predicate that raises
 * `fact_below_authority_floor`. This function is the JS MIRROR of that CASE and MUST NOT diverge; the
 * drift-guard in source-blocks.test.mjs parses migration 141 and fails CI on any mismatch (the surface_of
 * pattern). Do NOT add a family/floor here that migration 141 does not have (e.g. 'law' is NOT reg-family
 * in migration 141 → it is exempt here too).
 * @param {string | null | undefined} itemType
 * @returns {number | null}
 */
export function authorityFloorFor(itemType) {
  switch (itemType) {
    // reg family — MUST match migration 141 exactly (no 'law'): regulation/directive/standard/guidance/framework
    case "regulation": case "directive": case "standard": case "guidance": case "framework":
      return 2;
    case "research_finding":
      return 4;
    case "technology": case "innovation": case "tool":
      return 5;
    default:
      return null;
  }
}

/**
 * @param {SourceForBlock[]} fetched
 * @param {number} budget
 * @param {{ floorTier: number|null, hardCeiling: number }} opts
 * @returns {{ blocks: string, trims: TruncEvent[], ceilingWalls: TruncEvent[] }}
 */
export function buildSourceBlocks(fetched, budget, opts) {
  /** @type {TruncEvent[]} */ const trims = [];
  /** @type {TruncEvent[]} */ const ceilingWalls = [];
  if (!fetched.length) return { blocks: "", trims, ceilingWalls };
  const { floorTier, hardCeiling } = opts;
  // Best-tier first (lowest tier number), unregistered (null) last; STABLE within a tier.
  const ordered = fetched
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => ((a.tier ?? 99) - (b.tier ?? 99)) || (a._i - b._i));
  /** @type {string[]} */ const parts = [];
  let used = 0;
  for (const s of ordered) {
    const isFloor = floorTier != null && s.tier != null && s.tier <= floorTier;
    if (isFloor) {
      // MOAT: a floor-qualifying source is included in FULL, even if it overflows the budget — never
      // silently sliced. The only exception is a source larger than the hard ceiling, which is surfaced.
      if (s.text.length > hardCeiling) {
        ceilingWalls.push({ url: s.url, collected: 0, fullLength: s.text.length, cap: hardCeiling, transport: "context-ceiling-wall(floor)" });
        continue;
      }
      parts.push(`### SOURCE url=${s.url}\n${s.text}`);
      used += s.text.length;
      continue;
    }
    // Corroborator / sub-floor: only the remaining budget (floor-qualifiers went first); trimmed if needed,
    // dropped if <200 chars remain. Lowest tiers are last in `ordered` → they truncate first.
    const room = Math.max(0, budget - used);
    if (room < 200) { trims.push({ url: s.url, collected: 0, fullLength: s.text.length, cap: 0, transport: "synthesis-budget(dropped)" }); continue; }
    const t = s.text.length > room ? s.text.slice(0, room) : s.text;
    if (s.text.length > room) trims.push({ url: s.url, collected: room, fullLength: s.text.length, cap: room, transport: "synthesis-budget" });
    parts.push(`### SOURCE url=${s.url}\n${t}`);
    used += t.length;
  }
  return { blocks: parts.join("\n\n"), trims, ceilingWalls };
}
