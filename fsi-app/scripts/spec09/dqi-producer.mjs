#!/usr/bin/env node
// dqi-producer.mjs — spec 09 §1.4, tce_data_quality (migration 297). $0 SOURCING STATUS: GAP — see
// scripts/spec09/SOURCES.md. DQI is scored from a shipment's own primary evidence (carrier telemetry,
// fuel receipts, verified MRV) — customer/shipment-specific, not a bulk public dataset.
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-dqi-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): tce_data_quality producer, spec 09 §1.4. Ships 0 rows — DQI is " +
    "scored from shipment-specific primary evidence, not a bulk public dataset; see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-dqi",
    mode,
    counts: { to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: "DQI evidence is shipment-specific, no public bulk source — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("tce_data_quality", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-dqi",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
