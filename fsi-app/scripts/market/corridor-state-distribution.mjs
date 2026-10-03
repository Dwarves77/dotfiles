#!/usr/bin/env node
// corridor-state-distribution.mjs - read-only measurement of resolveItemCorridor()'s three-state
// outcome across every live market_signal/initiative item, against every active seeded corridor
// entity. Lane L-CORRIDOR (2026-10-03, coordinator follow-up): replaces the two pasted SQL SELECTs
// this lane's own session-log addendum handed the coordinator with a committed, deps-injected script
// the executor runs directly, same COMMON lane-contract idiom as seed-corridors.mjs and
// write-entity-scope.mjs (export async function main(opts, deps), CLI entry loads the real db.mjs and
// checks for creds, self-skip exit 2 rather than crash).
//
// READ-ONLY, NO WRITE PATH AT ALL (not even an --apply flag - there is nothing to apply). Both reads
// are plain SELECTs:
//   - intelligence_items WHERE item_type IN ('market_signal','initiative') AND is_archived = false,
//     columns id/legacy_id/title/jurisdiction_iso/transport_modes.
//   - entities WHERE kind = 'corridor' AND status = 'active', columns entity_id/canonical_name.
//
// NO SECOND MATCHING IMPLEMENTATION: candidatesFromCorridorEntities() and resolveItemCorridor() are
// imported from src/lib/market/resolve-item-corridor.mjs, the ONE home for this logic (lane
// L-CORRIDOR's own write set) - this script never re-derives the country-set/mode match itself.
//
// PLAIN ESM. Exit 0 done, exit 2 no DB creds (self-skip, never crash).

import { candidatesFromCorridorEntities, resolveItemCorridor } from "../../src/lib/market/resolve-item-corridor.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs"; // task 0.3b: the Windows-safe CLI main guard

/**
 * Tally resolveItemCorridor()'s state across a set of items against a candidate corridor set. Pure.
 * `items` is [{id, legacy_id, title, jurisdiction_iso, transport_modes}]. `candidates` is
 * candidatesFromCorridorEntities()'s own `candidates` array.
 * @returns {{
 *   counts: { resolved: number, ambiguous: number, no_corridor_identity: number },
 *   total: number,
 *   resolvedItems: Array<{id: string, legacy_id: string|null, title: string, corridor: object}>,
 *   ambiguousItems: Array<{id: string, legacy_id: string|null, title: string, matchedCandidateIds: string[]}>,
 * }}
 */
export function tallyCorridorStates(items, candidates) {
  const counts = { resolved: 0, ambiguous: 0, no_corridor_identity: 0 };
  const resolvedItems = [];
  const ambiguousItems = [];
  for (const item of items ?? []) {
    const result = resolveItemCorridor({
      jurisdictionIso: item?.jurisdiction_iso,
      modes: item?.transport_modes,
      candidates,
    });
    counts[result.state] += 1;
    if (result.state === "resolved") {
      resolvedItems.push({ id: item.id, legacy_id: item.legacy_id ?? null, title: item.title, corridor: result.corridor });
    } else if (result.state === "ambiguous") {
      ambiguousItems.push({ id: item.id, legacy_id: item.legacy_id ?? null, title: item.title, matchedCandidateIds: result.matchedCandidateIds });
    }
  }
  return { counts, total: (items ?? []).length, resolvedItems, ambiguousItems };
}

/**
 * @param {{}} opts  Unused - this script has no mode flags, it only ever reads.
 * @param {{ readAll: Function }} deps
 */
export async function main(_opts = {}, deps) {
  const { readAll } = deps;

  const [items, corridorRows] = await Promise.all([
    readAll("intelligence_items", "id, legacy_id, title, jurisdiction_iso, transport_modes", {
      match: (q) => q.in("item_type", ["market_signal", "initiative"]).eq("is_archived", false),
      orderBy: "id",
    }),
    readAll("entities", "entity_id, canonical_name", {
      match: (q) => q.eq("kind", "corridor").eq("status", "active"),
      orderBy: "entity_id",
    }),
  ]);

  const { candidates, skipped } = candidatesFromCorridorEntities(corridorRows);
  if (skipped.length > 0) {
    console.error(`[corridor-state-distribution] ${skipped.length} corridor row(s) skipped (unparsable canonical_name):`);
    for (const s of skipped) console.error(`   ${JSON.stringify(s)}`);
  }

  const { counts, total, resolvedItems, ambiguousItems } = tallyCorridorStates(items, candidates);

  console.log(`[corridor-state-distribution] items checked: ${total} (market_signal/initiative, not archived)`);
  console.log(`[corridor-state-distribution] candidate corridors: ${candidates.length} (active, kind='corridor')`);
  console.log(`[corridor-state-distribution] resolved: ${counts.resolved}; ambiguous: ${counts.ambiguous}; no_corridor_identity: ${counts.no_corridor_identity}`);
  for (const r of resolvedItems) {
    console.log(`   RESOLVED ${r.id} (${r.legacy_id ?? "no legacy_id"}) "${r.title}" -> ${JSON.stringify(r.corridor)}`);
  }
  for (const a of ambiguousItems) {
    console.log(`   AMBIGUOUS ${a.id} (${a.legacy_id ?? "no legacy_id"}) "${a.title}" -> matched ${a.matchedCandidateIds.length} corridors`);
  }

  return { total, candidateCount: candidates.length, counts, resolvedItems, ambiguousItems, corridorSkipped: skipped.length };
}

function loadEnv() {
  loadLocalEnvFile();
}

if (isMainModule(import.meta.url)) {
  (async () => {
    loadEnv();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[corridor-state-distribution] no DB creds - cannot run here (exit 2).");
      process.exit(2);
    }
    const { readAll } = await import("../lib/db.mjs");
    try {
      await main({}, { readAll });
      process.exit(0);
    } catch (e) {
      console.error("[corridor-state-distribution] FATAL:", e);
      process.exit(1);
    }
  })();
}
