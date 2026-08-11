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
 * Derive the flag's human description, recommended action and counts from an aggregate.
 *
 * TWO SHAPES, because there are two different situations behind a NULL tier and only one of them is a
 * registration backlog (ruling 2026-08-11, the 57-host batch):
 *
 *   permanentClass == null  → REGISTRATION PENDING. Nobody has ruled on this host yet. The recommended
 *     action is register-or-relabel, and the flag is the self-surfacing signal that names the next host to
 *     rule on (how lovdata.no would have been found mechanically).
 *
 *   permanentClass set      → RE-ATTRIBUTION. The host is an aggregator (republishes someone else's text)
 *     or a hosting platform (hosts someone else's publication). It is RULED never-registerable: minting it
 *     any tier would credit the republisher for the publisher's authority. Telling the operator to "register
 *     at its canonical institutional tier" here is not merely useless, it INVITES the error the ruling
 *     forbids — and it never stops, because a fresh grounding run re-opens the same flag with the same
 *     wrong instruction. The work is real, but it is on the SPAN (re-attribute to the actual publisher, or
 *     4c relabel), never on the registry.
 *
 * @param {string} host
 * @param {NullTierAggregate} agg
 * @param {"aggregator" | "platform" | null} [permanentClass]  from permanentlyUnregisteredClass(host)
 * @returns {{ itemCount: number, factCount: number, description: string, action: string, rationale: string }}
 */
export function summarizeNullTierAggregate(host, agg, permanentClass = null) {
  const itemCount = Object.keys(agg.perItemFacts).length;
  const factCount = Object.values(agg.perItemFacts).reduce((a, b) => a + b, 0);
  const spans = `${factCount} FACT span(s) across ${itemCount} item(s)`;
  // WORDING (ruling 2026-07-04, unchanged): state the OBSERVABLE fact (unregistered host, null tier), NOT a
  // floor verdict. The authority floor applies ONLY to CRITICAL/HIGH non-exempt items
  // (validate_item_provenance v_priority_high + v_floor_max); a null-tier FACT on a LOW/exempt item is NOT
  // "below floor" (no floor applies). Junk-commentary hosts (the common case) route to 4c relabel.
  if (permanentClass) {
    const what = permanentClass === "aggregator"
      ? "republishes text it did not publish"
      : "hosts a publication it did not publish";
    return {
      itemCount, factCount,
      // Kept inside the 480-char integrity_flags.description budget BY CONSTRUCTION, not by the caller's
      // slice(): a truncated re-attribution flag would lose the instruction that is its entire content.
      // Pinned by the column-budget test with a 73-char worst-case host.
      description: `Re-attribution required for ${host} (ruled ${permanentClass}, never registerable): ${spans} resolve to NULL tier. It ${what}, so it is not the publisher; any tier would credit it with the publisher's authority. Fix the SPAN not the registry: re-attribute to the real publisher, else 4c relabel. Floor-subject only for CRITICAL/HIGH non-exempt items.`,
      action: "reattribute_to_publisher",
      rationale: `${host} is a ruled ${permanentClass} and stays UNREGISTERED permanently; ${spans} currently NULL-stamp against it. Re-attribute each span to the publisher the host reproduced, or relabel the facts as grounded analysis (4c). Do not register this host.`,
    };
  }
  return {
    itemCount, factCount,
    description: `Unregistered host ${host}: ${spans} resolve to NULL tier (host not in the sources registry). Operator review: register at its canonical institutional tier IF an authoritative primary, else route the facts to 4c relabel (grounded analysis). Floor-subject only for CRITICAL/HIGH non-exempt items.`,
    action: "register_source",
    rationale: `Register ${host} at its canonical institutional tier; ${spans} currently wall on fact_below_authority_floor because the host is unregistered.`,
  };
}
