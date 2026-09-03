#!/usr/bin/env node
// eudr-custody-producer.mjs — spec 09 §1.8, eudr_plot_claims + custody_chains (migration 298). $0
// SOURCING STATUS: GAP for both tables — see scripts/spec09/SOURCES.md. EUDR due-diligence statements
// are filed per-consignment through the EU's own TRACES system, not bulk-downloadable; ISCC/RSB/SFC
// certificate registries expose public single-lookup portals, not a bulk/API feed confirmed at $0.
//
// DRY BY DEFAULT. deps-injected so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-eudr-custody-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): eudr_plot_claims/custody_chains producer, spec 09 §1.8. Ships 0 " +
    "rows for both tables — neither TRACES filings nor certificate-registry lookups have a $0 bulk feed " +
    "confirmed this session; see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-eudr-custody",
    mode,
    counts: { to_insert_eudr_plot_claims: 0, to_insert_custody_chains: 0 },
    applied: 0,
    read_back: {},
    gap: "no $0 bulk feed for TRACES filings or certificate-registry lookups — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    await deps.guardedInsertMany("eudr_plot_claims", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-eudr-custody",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany };
    },
  });
}
