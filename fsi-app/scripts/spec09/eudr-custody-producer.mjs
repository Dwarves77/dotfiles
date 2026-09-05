#!/usr/bin/env node
// eudr-custody-producer.mjs — spec 09 §1.8, eudr_plot_claims + custody_chains (migration 298, org-scoped
// by a follow-up migration this lane — see docs/inventories/shared-dataset-ownership.md).
//
// REFACTORED this lane (W5.1, customer-data CSV upload flow): this producer WAS a permanent no-op for
// both tables. It is now THE PARSER the workspace upload route calls into (one call per table — the
// upload route lets an org upload each table separately, since a plot claim and a custody certificate
// are usually filed by different teams on different days) — src/lib/spec09/csv-upload-contract.mjs holds
// the one shared column contract; this CLI script and src/app/api/workspace/spec09-upload/route.ts both
// import the SAME `parseCsvUpload` ("one body").
//
// applyHoldRiskDefault() is exported so both this producer AND the upload route apply the identical
// write-time default (spec 09 §2.1 "materialise it": a customer who leaves hold_risk blank gets the
// value src/lib/spec09/eudr-custody.mjs's suggestHoldRiskFromValidationState() derives from
// validation_state, computed ONCE at write time, never recomputed at read time) — a second, independent
// implementation of this default would risk drifting from the read-side classifier's own assumptions.
//
// DRY BY DEFAULT. With neither CSV given, behaves as before: a no-op naming why, for both tables. Either
// table can be uploaded independently of the other (deps.eudrCsvText / deps.custodyCsvText are each
// optional).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { parseCsvUpload } from "../../src/lib/spec09/csv-upload-contract.mjs";
import { suggestHoldRiskFromValidationState } from "../../src/lib/spec09/eudr-custody.mjs";
import { readCliCsvArgs } from "./lib/cli-csv-args.mjs";

export const CITE = Object.freeze({
  skill: "spec09-eudr-custody-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03; CSV upload flow wired train 2026-09-05): eudr_plot_claims/" +
    "custody_chains producer, spec 09 §1.8. Parses customer-uploaded consignment geo-traceability and " +
    "certificate CSVs through the shared contract and inserts the accepted rows, org-scoped server-side. " +
    "See scripts/spec09/SOURCES.md.",
});

/** The one write-time hold_risk default, shared by this producer and the upload route — see header.
 *  Never overrides an explicit customer-supplied hold_risk (only fills a blank one). */
export function applyHoldRiskDefault(validationState) {
  return suggestHoldRiskFromValidationState(validationState);
}

// `insertFn` is a (rows) => Promise<{inserted, rows}> callback ALREADY bound to its own table's string
// literal at the call site below (rather than this function taking a `guardedInsertMany` + `table`
// parameter pair) — so the closure-gate's WRITER-READER check, which greps
// guardedInsertMany('<literal>', ...) statically, can see each table's write as its own call site.
async function runTable(table, csvText, orgId, apply, insertFn) {
  const out = { to_insert: 0, rejected: 0, rejectedReasons: [], applied: 0, read_back: {} };
  if (!csvText) return out;
  const parsed = parseCsvUpload(table, csvText);
  if (!parsed.ok) {
    out.error = parsed.error;
    return out;
  }
  out.to_insert = parsed.accepted.length;
  out.rejected = parsed.rejected.length;
  out.rejectedReasons = parsed.rejected.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors }));
  const rows = parsed.accepted.map(({ data }) => {
    const row = { ...data, org_id: orgId };
    if (table === "eudr_plot_claims" && row.hold_risk === null) {
      row.hold_risk = applyHoldRiskDefault(row.validation_state);
    }
    return row;
  });
  if (apply && insertFn && rows.length) {
    const res = await insertFn(rows);
    out.applied = res.inserted;
    out.read_back = { inserted_ids: (res.rows ?? []).map((r) => r.id) };
  }
  return out;
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ eudrCsvText?: string, custodyCsvText?: string, orgId?: string, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-eudr-custody",
    mode,
    counts: { to_insert_eudr_plot_claims: 0, to_insert_custody_chains: 0, rejected_eudr_plot_claims: 0, rejected_custody_chains: 0 },
    rejected: { eudr_plot_claims: [], custody_chains: [] },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!deps.eudrCsvText && !deps.custodyCsvText) {
    summary.gap = "no customer CSV given this run for either table — eudr_plot_claims/custody_chains " +
      "have no rows until a workspace member uploads their own consignment filing or certificate " +
      "(POST /api/workspace/spec09-upload). See scripts/spec09/SOURCES.md.";
    return summary;
  }
  if ((deps.eudrCsvText || deps.custodyCsvText) && !deps.orgId) {
    summary.error = "deps.orgId is required whenever a CSV is given (org_id is never read from the CSV itself).";
    summary.exitCode = 1;
    return summary;
  }

  const eudr = await runTable("eudr_plot_claims", deps.eudrCsvText, deps.orgId, apply,
    deps.guardedInsertMany ? (rows) => deps.guardedInsertMany("eudr_plot_claims", rows, { cite: CITE }) : null);
  const custody = await runTable("custody_chains", deps.custodyCsvText, deps.orgId, apply,
    deps.guardedInsertMany ? (rows) => deps.guardedInsertMany("custody_chains", rows, { cite: CITE }) : null);

  if (eudr.error || custody.error) {
    summary.error = [eudr.error, custody.error].filter(Boolean).join(" | ");
    summary.exitCode = 1;
    return summary;
  }

  summary.counts.to_insert_eudr_plot_claims = eudr.to_insert;
  summary.counts.to_insert_custody_chains = custody.to_insert;
  summary.counts.rejected_eudr_plot_claims = eudr.rejected;
  summary.counts.rejected_custody_chains = custody.rejected;
  summary.rejected.eudr_plot_claims = eudr.rejectedReasons;
  summary.rejected.custody_chains = custody.rejectedReasons;
  summary.applied = eudr.applied + custody.applied;
  summary.read_back = { eudr_plot_claims: eudr.read_back, custody_chains: custody.read_back };
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
      const { csvText, custodyCsvText, orgId } = readCliCsvArgs();
      return { guardedInsertMany, eudrCsvText: csvText, custodyCsvText, orgId };
    },
  });
}
