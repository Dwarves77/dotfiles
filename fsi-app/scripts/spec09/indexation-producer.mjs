#!/usr/bin/env node
// indexation-producer.mjs — spec 09 §1.3, indexation_clauses (migration 296, org-scoped by a follow-up
// migration this lane — see docs/inventories/shared-dataset-ownership.md).
//
// REFACTORED this lane (W5.1): indexation_clauses is genuinely customer-supplied data (SOURCES.md's own
// prior text: "this table stores CONTRACT-SPECIFIC terms... there is no bulk public source for another
// company's contract terms, by the nature of the data... Genuinely customer-entry-only"). It shares the
// exact shape of the five tables the plan names "customer data" and is folded into the same CSV upload
// flow rather than left an eternally-empty reader (the workstream text groups it with
// carrier_compliance_pools only because both lacked a UI reader — this table's reader is now
// IndexationPanel.tsx on Market, and its data path is this CSV upload, same as the other five). This
// producer WAS a permanent no-op; it is now THE PARSER the workspace upload route calls into —
// src/lib/spec09/csv-upload-contract.mjs holds the one shared column contract; this CLI script and
// src/app/api/workspace/spec09-upload/route.ts both import the SAME `parseCsvUpload` ("one body").
//
// The WORKED_EXAMPLE below is retained unchanged (spec text's own illustrative clause) and is still
// emitted in every run's summary regardless of whether a customer CSV was given — it documents the
// mechanics computeIndexedValue() applies, independent of whether any real clause exists yet.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { parseCsvUpload } from "../../src/lib/spec09/csv-upload-contract.mjs";
import { computeIndexedValue } from "../../src/lib/spec09/indexation.mjs";
import { readCliCsvArgs } from "./lib/cli-csv-args.mjs";

const TABLE = "indexation_clauses";

export const CITE = Object.freeze({
  skill: "spec09-indexation-producer",
  reason:
    "Lane SPEC-09 (wave 3, 2026-09-03; CSV upload flow wired train 2026-09-05): indexation_clauses " +
    "producer, spec 09 §1.3. Parses a customer-uploaded contract-clause CSV through the shared contract " +
    "and inserts the accepted rows, org-scoped server-side. See scripts/spec09/SOURCES.md.",
});

// A documented illustrative clause (EUA front-Dec, base 80 at signature, current 92, 70% passthrough,
// floor -10%/cap +20%) — spec text's own kind of worked example, not a real customer contract.
export const WORKED_EXAMPLE = Object.freeze({
  indexLabel: "EUA front-Dec",
  baseValue: 80,
  indexBaseline: 80,
  indexCurrent: 92,
  passthroughPct: 70,
  floorPct: -10,
  capPct: 20,
});

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ csvText?: string, orgId?: string, guardedInsertMany?: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const summary = {
    step: "spec09-indexation",
    mode,
    counts: { to_insert: 0, rejected: 0 },
    rejected: [],
    applied: 0,
    read_back: {},
    worked_example: { ...WORKED_EXAMPLE, result: computeIndexedValue(WORKED_EXAMPLE) },
    exitCode: 0,
  };

  if (!deps.csvText) {
    summary.gap = "no customer CSV given this run — indexation_clauses has no rows until a workspace " +
      "member uploads their own contract clause terms (POST /api/workspace/spec09-upload). See scripts/spec09/SOURCES.md.";
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
    const res = await deps.guardedInsertMany("indexation_clauses", rows, { cite: CITE });
    summary.applied = res.inserted;
    summary.read_back = { inserted_ids: (res.rows ?? []).map((r) => r.id) };
  }
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "spec09-indexation",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { guardedInsertMany } = await import("../lib/db.mjs");
      return { guardedInsertMany, ...readCliCsvArgs() };
    },
  });
}
