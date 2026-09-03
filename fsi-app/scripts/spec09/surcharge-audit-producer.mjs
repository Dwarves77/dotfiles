#!/usr/bin/env node
// surcharge-audit-producer.mjs — spec 09 §1.2, built FIRST per spec §4. Writes surcharge_audits and
// carrier_compliance_pools (migration 296). $0 SOURCING STATUS: GAP for both tables — see
// scripts/spec09/SOURCES.md for the full reasoning. surcharge_audits' own input is the CUSTOMER'S OWN
// INVOICE (spec text's worked example), which this product has no upload flow for yet (out of this
// lane's write set); carrier_compliance_pools could in principle be fed from THETIS-MRV (EMSA, public)
// but a bulk parser was out of this lane's time budget AND spec 09 §5 open decision 1 holds the pool
// inference internal regardless, so building the parser would not change what is surfaced.
//
// DRY BY DEFAULT (COMMON lane contract). --apply is a no-op today (there is nothing to insert — see
// above) and is exercised here only so the script's shape is proven, not because it writes anything.
// deps-injected (readAll/guardedInsertMany) so this runs with zero DB access under `node --test`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "spec09-surcharge-audit-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03): surcharge_audits/carrier_compliance_pools producer, spec 09 §1.2. " +
    "Ships 0 rows — no $0 bulk source names either table's own input (customer invoice / THETIS-MRV bulk " +
    "parse); see scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll?: Function, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-surcharge-audit",
    mode,
    counts: { to_insert_surcharge_audits: 0, to_insert_carrier_compliance_pools: 0 },
    applied: 0,
    read_back: {},
    gap: "no $0 bulk source for either table's own input this run — see scripts/spec09/SOURCES.md",
    exitCode: 0,
  };
  if (apply && deps.guardedInsertMany) {
    // Nothing to insert (see header) — the guarded path is exercised with an empty batch so the shape is
    // real, not merely asserted, matching this codebase's "attack, don't assert presence" posture applied
    // to the NO-OP case: an empty guardedInsertMany call still requires a cite and still round-trips.
    await deps.guardedInsertMany("surcharge_audits", [], { cite: CITE });
    summary.applied = 0;
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-surcharge-audit",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
      return { readAll, guardedInsertMany };
    },
  });
}
