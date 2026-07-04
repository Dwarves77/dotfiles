// @ts-check
// PURE merge for the ruling-5 self-surfacing null-tier host flag (span-attribution unit, 2026-07-03).
// A FACT that grounds to an UNREGISTERED host (null tier even after floor-first re-attribution) is the
// "authoritative host nobody registered yet" signal — the exact shape that made lovdata.no absent. Rather
// than a per-item quarantine, grounding aggregates these per HOST into ONE integrity_flag/host that
// verifyCandidate consumes at hold-lift (shaped for Phase 3's unresolved-entity aggregation). No new queue.
//
// The flag carries a per-item fact-count MAP (not a running total) so a re-ground of the same item
// OVERWRITES its own contribution instead of double-counting — idempotent under repeated grounding.

const MAX_SAMPLES = 5;

/**
 * @typedef {{ perItemFacts: Record<string, number>, sampleSpans: string[] }} NullTierAggregate
 */

/**
 * Merge one item's null-tier contribution for a host into the existing aggregate (or a fresh one).
 * Idempotent per item: this item's fact count REPLACES any prior value for it.
 * @param {NullTierAggregate | null | undefined} existing  prior aggregate (from the open flag), if any
 * @param {string} itemId
 * @param {{ factCount: number, samples: string[] }} contribution
 * @returns {NullTierAggregate}
 */
export function mergeNullTierAggregate(existing, itemId, contribution) {
  const perItemFacts = { ...(existing?.perItemFacts ?? {}) };
  perItemFacts[itemId] = contribution.factCount; // overwrite -> idempotent on re-ground
  const seen = new Set(existing?.sampleSpans ?? []);
  const sampleSpans = [...(existing?.sampleSpans ?? [])];
  for (const s of contribution.samples ?? []) {
    if (sampleSpans.length >= MAX_SAMPLES) break;
    if (s && !seen.has(s)) { seen.add(s); sampleSpans.push(s); }
  }
  return { perItemFacts, sampleSpans };
}

/**
 * Derive the flag's human description + counts from an aggregate.
 * @param {string} host
 * @param {NullTierAggregate} agg
 * @returns {{ itemCount: number, factCount: number, description: string }}
 */
export function summarizeNullTierAggregate(host, agg) {
  const itemCount = Object.keys(agg.perItemFacts).length;
  const factCount = Object.values(agg.perItemFacts).reduce((a, b) => a + b, 0);
  const description = `Unregistered host ${host} carries ${factCount} FACT span(s) across ${itemCount} item(s) that resolve to NULL tier (below the authority floor because the host is not in the sources registry). Register it at its canonical institutional tier so these facts ground at the floor instead of walling.`;
  return { itemCount, factCount, description };
}
