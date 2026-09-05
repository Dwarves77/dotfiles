#!/usr/bin/env node
// auxiliary-energy-producer.mjs — spec 09 §1.5, auxiliary_energy_profiles (migration 297, org-scoped by a
// follow-up migration this lane — see docs/inventories/shared-dataset-ownership.md).
//
// REFACTORED this lane (W5.1, customer-data CSV upload flow): this producer WAS a permanent no-op. It is
// now THE PARSER the workspace upload route calls into — src/lib/spec09/csv-upload-contract.mjs holds the
// one shared column contract; this CLI script and src/app/api/workspace/spec09-upload/route.ts both
// import the SAME `parseCsvUpload` ("one body").
//
// DRY BY DEFAULT. With no CSV given, behaves as before: a no-op naming why. With deps.csvText +
// deps.orgId, parses and (on --apply) inserts through the guarded path.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { parseCsvUpload } from "../../src/lib/spec09/csv-upload-contract.mjs";
import { readCliCsvArgs } from "./lib/cli-csv-args.mjs";

const TABLE = "auxiliary_energy_profiles";

export const CITE = Object.freeze({
  skill: "spec09-auxiliary-energy-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03; CSV upload flow wired train 2026-09-05): auxiliary_energy_profiles " +
    "producer, spec 09 §1.5. Parses a customer-uploaded stationary-load CSV (reefer/hold/warehouse " +
    "equipment) through the shared contract and inserts the accepted rows, org-scoped server-side. See " +
    "scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ csvText?: string, orgId?: string, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-auxiliary-energy",
    mode,
    counts: { to_insert: 0, rejected: 0 },
    rejected: [],
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!deps.csvText) {
    summary.gap = "no customer CSV given this run — auxiliary_energy_profiles has no rows until a " +
      "workspace member uploads their own asset profile (POST /api/workspace/spec09-upload). See scripts/spec09/SOURCES.md.";
    return summary;
  }
  if (!deps.orgId) {
    summary.error = "deps.orgId is required whenever deps.csvText is given (org_id is never read from the CSV itself).";
    summary.exitCode = 1;
    return summary;
  }

  const parsed = parseCsvUpload(TABLE, deps.csvText);
  if (!parsed.ok) {
    summary.error = parsed.error;
    summary.exitCode = 1;
    return summary;
  }
  summary.counts.to_insert = parsed.accepted.length;
  summary.counts.rejected = parsed.rejected.length;
  summary.rejected = parsed.rejected.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors }));

  const rows = parsed.accepted.map(({ data }) => ({ ...data, org_id: deps.orgId }));
  if (apply && deps.guardedInsertMany && rows.length) {
    // Table name inlined as a string literal (see surcharge-audit-producer.mjs's identical comment) so
    // the closure-gate's WRITER-READER check can see this write statically.
    const res = await deps.guardedInsertMany("auxiliary_energy_profiles", rows, { cite: CITE });
    summary.applied = res.inserted;
    summary.read_back = { inserted_ids: (res.rows ?? []).map((r) => r.id) };
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
      return { guardedInsertMany, ...readCliCsvArgs() };
    },
  });
}
