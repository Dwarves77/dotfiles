#!/usr/bin/env node
// auxiliary-energy-producer.mjs — spec 09 §1.5, auxiliary_energy_profiles (migration 297). $0 SOURCING
// STATUS: GAP — see scripts/spec09/SOURCES.md. kw_draw/duty_cycle/setpoint are facts about a customer's
// own reefer/hold/warehouse equipment; no public bulk source describes another company's assets.
// (grid_intensity_source itself — Ember/EEA — already has a path into this product via regional_data_facts,
// migration 106, populated elsewhere; this table only names that source, it does not re-fetch it.)
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-auxiliary-energy-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): auxiliary_energy_profiles producer, spec 09 §1.5. Ships 0 rows — " +
    "asset-specific auxiliary-load facts have no public bulk source; see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-auxiliary-energy",
    mode,
    counts: { to_insert: 0 },
    applied: 0,
    read_back: {},
    gap: "asset-specific auxiliary-load facts have no public bulk source — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("auxiliary_energy_profiles", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-auxiliary-energy",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
