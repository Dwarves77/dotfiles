// lineage-backfill.mjs — pure partition/upgrade-decision logic for the WO-28 phase D $0 backfill
// (scripts/entities/backfill-lineage-edges.mjs). Extracted into its own module (rather than left inline in
// the script) because this is the ONE piece of the backfill that carries real decision logic — everything
// else in the script is I/O orchestration (load rows, call the runtime's own planLinkWrites, print a
// report). Pure + dep-injected (no DB import here) so it is unit-tested without a database, mirroring how
// entity-resolve.mjs itself stays pure and dep-injected.
//
// THE DECISION THIS MAKES: item_cross_references is unique on (source_item_id, target_item_id), ONE row
// per ordered pair shared across every origin (manual / agent_semantic / entity_extraction /
// provenance_discovery — migration 252's CHECK). This backfill and the linkStep runtime BOTH write
// origin='entity_extraction' (planLinkWrites hardcodes it — see entity-resolve.mjs). A pair already carrying
// entity_extraction is OURS: re-running the same planner over it may now produce a MORE SPECIFIC typed
// relationship (implements/amends/depends_on) than the untyped 'related' an earlier entity-extraction pass
// left behind — WO-28 phase 1's whole point — so it gets UPGRADED (relationship + basis). A pair absent
// entirely gets INSERTED. A pair owned by any OTHER origin (manual/agent_semantic/provenance_discovery) is
// a different subsystem's edge with its own more-specific semantics; touching it would be exactly the
// blind-upsert bug write-edges.mjs's ORIGIN OWNERSHIP note documents for the sibling connection-discovery
// backfill, so it is SKIPPED and counted, never clobbered. A pair already entity_extraction AND already
// carrying the SAME relationship+basis this run would produce is UNCHANGED — no write, idempotent re-runs.

// The origin THIS backfill (and the linkStep runtime) writes. Pairs at this origin are "ours" and may be
// upgraded; every other origin value is foreign and must never be touched by this module.
export const LINEAGE_BACKFILL_ORIGIN = "entity_extraction";

export function pairKey(source, target) {
  return `${source}|${target}`;
}

// undefined and null both mean "no basis" (planLinkWrites omits the `basis` key entirely for an untyped
// 'related' edge — see its `...(e.basis ? { basis: e.basis } : {})` spread) — normalize before comparing.
function basisEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const byPair = (a, b) => pairKey(a.source_item_id, a.target_item_id).localeCompare(pairKey(b.source_item_id, b.target_item_id));

/**
 * Partition the item_cross_references rows inside a planLinkWrites() plan against the LIVE edge set,
 * deciding insert / upgrade / skip-foreign / unchanged for each. integrity_flags rows in `writes` are
 * ignored here (flag dedup is its own, simpler, one-open-per-namespace rule — handled in the script).
 *
 * @param {Array<{table:string, row:object}>} writes - planLinkWrites()'s full return value (edges + flags mixed)
 * @param {Map<string,{id:string, origin:string, relationship:string, basis?:any}>} existingEdgesByPair
 *   keyed by pairKey(source_item_id, target_item_id) — the live item_cross_references rows for the pairs
 *   this run might touch (caller loads this once, up front, per rule-015's prior-state-snapshot posture).
 * @returns {{
 *   inserts: Array<object>,                                            // full row objects, ready for guardedInsertMany
 *   upgrades: Array<{id, source_item_id, target_item_id, relationship, basis}>, // one guardedUpdate call each (patches differ per row)
 *   skippedForeign: Array<{source_item_id, target_item_id, foreignOrigin}>,
 *   unchanged: Array<{id, source_item_id, target_item_id}>,
 * }}
 */
export function partitionLineageWrites(writes, existingEdgesByPair) {
  const edgeWrites = (writes || []).filter((w) => w && w.table === "item_cross_references");
  const inserts = [];
  const upgrades = [];
  const skippedForeign = [];
  const unchanged = [];

  for (const w of edgeWrites) {
    const row = w.row;
    const key = pairKey(row.source_item_id, row.target_item_id);
    const existing = existingEdgesByPair ? existingEdgesByPair.get(key) : undefined;

    if (!existing) {
      inserts.push(row);
      continue;
    }
    if (existing.origin !== LINEAGE_BACKFILL_ORIGIN) {
      skippedForeign.push({ source_item_id: row.source_item_id, target_item_id: row.target_item_id, foreignOrigin: existing.origin });
      continue;
    }
    // ours — upgrade iff the typed relationship or its basis actually differs from what's already stored.
    if (existing.relationship === row.relationship && basisEqual(existing.basis, row.basis)) {
      unchanged.push({ id: existing.id, source_item_id: row.source_item_id, target_item_id: row.target_item_id });
      continue;
    }
    upgrades.push({
      id: existing.id,
      source_item_id: row.source_item_id,
      target_item_id: row.target_item_id,
      relationship: row.relationship,
      basis: row.basis ?? null,
    });
  }

  // Deterministic ordering (by source|target pair) — makes the report and the rule-015 snapshot
  // reproducible across runs of the SAME input, independent of Map/array iteration order.
  inserts.sort(byPair);
  upgrades.sort(byPair);
  skippedForeign.sort(byPair);
  unchanged.sort(byPair);

  return { inserts, upgrades, skippedForeign, unchanged };
}
