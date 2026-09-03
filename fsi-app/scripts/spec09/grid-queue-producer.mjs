#!/usr/bin/env node
// grid-queue-producer.mjs — spec 09 §1.6, grid_connection_queues (migration 297). $0 SOURCING STATUS:
// GAP — see scripts/spec09/SOURCES.md. No $0 structured feed was confirmed for DSO/TSO demand-connection
// queue MONTHS by capacity band; UK National Grid ESO's TEC register and ENA's DFES describe GENERATION
// connection queues, a different dataset, and conflating them would be fabrication (rule 2).
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-grid-queue-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): grid_connection_queues producer, spec 09 §1.6. Ships 0 rows — no " +
    "confirmed $0 feed for demand-side DSO connection-queue months; see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-grid-queue",
    mode,
    counts: { to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: "no confirmed $0 feed for demand-side DSO connection-queue months — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("grid_connection_queues", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-grid-queue",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
