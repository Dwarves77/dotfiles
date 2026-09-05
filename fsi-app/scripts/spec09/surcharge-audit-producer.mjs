#!/usr/bin/env node
// surcharge-audit-producer.mjs — spec 09 §1.2, built FIRST per spec §4. Writes surcharge_audits
// (migration 296, org-scoped by a follow-up migration this lane — see
// docs/inventories/shared-dataset-ownership.md).
//
// REFACTORED this lane (W5.1, customer-data CSV upload flow): this producer WAS a permanent no-op
// ("$0 SOURCING STATUS: GAP — no upload flow exists yet", see scripts/spec09/SOURCES.md's prior text).
// It is now THE PARSER the workspace upload route calls into — src/lib/spec09/csv-upload-contract.mjs
// holds the one shared column contract, and both this CLI script and
// src/app/api/workspace/spec09-upload/route.ts import the SAME `parseCsvUpload` — "one body", per the
// lane brief, never two copies of the row-validation logic.
//
// carrier_compliance_pools (this file's OTHER original target) is DROPPED this lane (migration — see
// that migration's header): it had no customer-entry shape (it is an INFERRED pool position from public
// THETIS-MRV data, never customer-supplied), a full bulk parser was out of this lane's time budget both
// times, and per CLAUDE.md ("anything that cannot meet all six [done-conditions] is deleted in this
// lane... nothing left built, dormant") an eternally-0-row table with no realistic path to a real writer
// is deleted rather than kept designed-only. See scripts/spec09/SOURCES.md for the updated status table.
//
// DRY BY DEFAULT (COMMON lane contract). With no CSV given (deps.csvText undefined), behaves exactly as
// before: a no-op naming why (a customer has not uploaded anything yet). With deps.csvText + deps.orgId,
// parses and (on --apply) inserts through the guarded path — org_id is ALWAYS the caller-supplied
// deps.orgId, never read from the CSV itself (the shared contract never defines an org_id column at all).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { parseCsvUpload } from "../../src/lib/spec09/csv-upload-contract.mjs";
import { readCliCsvArgs } from "./lib/cli-csv-args.mjs";

const TABLE = "surcharge_audits";

export const CITE = Object.freeze({
  skill: "spec09-surcharge-audit-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03; CSV upload flow wired train 2026-09-05): surcharge_audits producer, " +
    "spec 09 §1.2. Parses a customer-uploaded carrier-invoice CSV (the input the calculation is ABOUT — " +
    "spec text's own worked example) through the shared contract (src/lib/spec09/csv-upload-contract.mjs) " +
    "and inserts the accepted rows, org-scoped server-side. See scripts/spec09/SOURCES.md.",
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ csvText?: string, orgId?: string, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-surcharge-audit",
    mode,
    counts: { to_insert: 0, rejected: 0 },
    rejected: [],
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!deps.csvText) {
    summary.gap = "no customer CSV given this run — surcharge_audits has no rows until a workspace " +
      "member uploads their own carrier invoice (POST /api/workspace/spec09-upload). See scripts/spec09/SOURCES.md.";
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
    // Table name inlined as a string literal here (not the TABLE const above) so the closure-gate's
    // WRITER-READER check — which greps guardedInsertMany('<literal>', ...) — can see this write
    // statically; TABLE and this literal are the same value by construction (parseCsvUpload(TABLE, ...)
    // above already validated against it).
    const res = await deps.guardedInsertMany("surcharge_audits", rows, { cite: CITE });
    summary.applied = res.inserted;
    summary.read_back = { inserted_ids: (res.rows ?? []).map((r) => r.id) };
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
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany, ...readCliCsvArgs() };
    },
  });
}
