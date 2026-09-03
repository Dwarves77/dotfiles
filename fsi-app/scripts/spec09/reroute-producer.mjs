#!/usr/bin/env node
// reroute-producer.mjs — spec 09 §1.7, reroute_events (migration 296). $0 SOURCING STATUS: GAP, a
// DIFFERENT shape from the other producers in this directory — see scripts/spec09/SOURCES.md. The Suez/
// Cape Red Sea diversion is well-documented public fact, but this table requires TWO DISTINCT
// `entities.kind='corridor'` rows (baseline + reroute — the exact fix spec 09 §0 exists to make
// representable), and only ONE corridor entity exists in the spine today (lane CORR's wave-2 seed,
// `CNSHA-NLRTM:ocean`). This producer READS the live corridor entity count (deps.readAll, never invents
// one) and reports the honest gap rather than fabricating a second corridor id — minting one is
// entities/entity_kind territory (COMMUNITY-A/CORR's write set, not this lane's).
//
// DRY BY DEFAULT. deps-injected (readAll/guardedInsertMany) so this runs with zero DB access under
// `node --test` — corridorRows() below is the pure decision logic, unit-tested directly against a
// fixture list, independent of the DB-reading wrapper around it.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-reroute-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): reroute_events producer, spec 09 §1.7. Ships 0 rows — fewer than " +
    "two entities.kind='corridor' rows exist in the spine to pair as baseline+reroute; see scripts/spec09/SOURCES.md.",
});

/**
 * Pure decision over a list of live corridor entity rows. `corridors` is [{ entity_id, canonical_name }].
 * Returns { ready: boolean, count, gap } — `ready` is never true from this function alone (see header:
 * even with >=2 corridors on file, this producer does not itself judge WHICH pair is a real reroute
 * event, or supply cause/fuel_burn_multiplier — that is a sourced, dated public-fact judgement this
 * session did not make), but the count and the specific gap reported differ so a future run's summary is
 * accurate as the spine grows.
 */
export function evaluateCorridorReadiness(corridors) {
  const list = Array.isArray(corridors) ? corridors : [];
  if (list.length < 2) {
    return {
      ready: false,
      count: list.length,
      gap:
        `only ${list.length} corridor entit${list.length === 1 ? "y" : "ies"} in the spine — a reroute event ` +
        "needs a DISTINCT baseline + reroute corridor pair (2 minimum). Minting a second corridor entity is " +
        "entities/entity_kind territory, out of this lane's write set. See scripts/spec09/SOURCES.md.",
    };
  }
  return {
    ready: false, // see function header: count alone is never sufficient
    count: list.length,
    gap:
      `${list.length} corridor entities exist but no producer-confirmed reroute pairing (cause + ` +
      "fuel_burn_multiplier, sourced and dated) is built this run — see scripts/spec09/SOURCES.md.",
  };
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll?: Function, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const corridors = deps.readAll
    ? await deps.readAll("entities", "entity_id,canonical_name", {
        match: (q) => q.eq("kind", "corridor"),
        orderBy: "entity_id",
      })
    : [];
  const readiness = evaluateCorridorReadiness(corridors);
  const summary = {
    step: "spec09-reroute",
    mode,
    counts: { corridor_entities_found: readiness.count, to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: readiness.gap,
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("reroute_events", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-reroute",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany };
    },
  });
}
