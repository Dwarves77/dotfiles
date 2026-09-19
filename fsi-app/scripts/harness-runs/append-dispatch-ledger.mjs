#!/usr/bin/env node
// append-dispatch-ledger.mjs -- the machine writer for docs/ops/dispatch-ledger.jsonl (lane M9b,
// 2026-09-18, closing stage-audit-2026-09-18 s6-gates-harness.md's finding: "the dispatch ledger
// (docs/ops/dispatch-ledger.jsonl) stopped at 2026-09-07 while 24 maintenance steps landed since, because
// a person appended it by hand").
//
// WHAT THIS DOES. A pure row builder (buildLedgerRow) plus a thin file-append (appendLedgerRow), and a
// tiny CLI wiring the two to a workflow's own environment. It does not decide outcome -- the caller (a
// workflow step) reads its own job status and passes the right outcome value in; this module only shapes
// and writes the row.
//
// ROW SHAPE -- the exact 7 fields the existing 81 hand-written rows all carry (read via
// `node -e "..." docs/ops/dispatch-ledger.jsonl` this lane's own investigation): date, workflow, step,
// mode, run_id, outcome, note. No 8th field is added: "the artifact path when there is one" (brief-m9b.md
// item 1) folds into `note` as free text, the SAME way every existing row already embeds an artifact
// reference in its own note (e.g. the 2026-09-07 downstream-chain row: "...artifact
// downstream-chain-34078833140..."), rather than introducing a field none of the 81 rows has.
//
// $0, filesystem-only -- no DB, no network.
import { appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";

const REQUIRED = ["date", "workflow", "step", "mode", "runId", "outcome"];

/**
 * Build one dispatch-ledger row. Pure -- no I/O, never throws for a valid input, throws for a missing
 * required field (fail closed: a caller that forgot a field gets a named error, not a malformed row on
 * disk).
 * @param {{date: string, workflow: string, step: string, mode: string, runId: string|number,
 *   outcome: string, note?: string, artifactPath?: string|null}} input
 * @returns {{date: string, workflow: string, step: string, mode: string, run_id: string, outcome: string,
 *   note: string}}
 */
export function buildLedgerRow(input) {
  const missing = REQUIRED.filter((k) => input?.[k] === undefined || input?.[k] === null || input?.[k] === "");
  if (missing.length) {
    throw new Error(`buildLedgerRow: missing required field(s): ${missing.join(", ")}`);
  }
  const { date, workflow, step, mode, runId, outcome, note = "", artifactPath = null } = input;
  const fullNote = artifactPath
    ? `${note ? `${note} ` : ""}artifact ${artifactPath}`.trim()
    : note;
  return {
    date,
    workflow,
    step,
    mode,
    run_id: String(runId),
    outcome,
    note: fullNote,
  };
}

/**
 * Append one row as a JSONL line to `ledgerPath`. Never rewrites or reorders existing lines -- an
 * append-only file, the same discipline every harness-run artifact directory already applies to its own
 * numbered files (never overwritten, only added to).
 * @param {object} row from buildLedgerRow
 * @param {string} ledgerPath absolute or cwd-relative path to docs/ops/dispatch-ledger.jsonl
 * @returns {string} ledgerPath
 */
export function appendLedgerRow(row, ledgerPath) {
  const resolved = resolve(ledgerPath);
  if (!existsSync(resolved)) {
    throw new Error(`appendLedgerRow: ${resolved} does not exist -- refusing to create a new ledger file.`);
  }
  appendFileSync(resolved, `${JSON.stringify(row)}\n`, "utf8");
  return resolved;
}

function parseArgs(argv) {
  const get = (flag, def = undefined) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
  };
  return {
    date: get("--date"),
    workflow: get("--workflow"),
    step: get("--step"),
    mode: get("--mode"),
    runId: get("--run-id"),
    outcome: get("--outcome"),
    note: get("--note", ""),
    artifactPath: get("--artifact", null),
    ledger: get("--ledger", "docs/ops/dispatch-ledger.jsonl"),
  };
}

async function main() {
  const { ledger, ...rest } = parseArgs(process.argv.slice(2));
  const row = buildLedgerRow(rest);
  const path = appendLedgerRow(row, ledger);
  console.log(`append-dispatch-ledger: wrote ${JSON.stringify(row)} to ${path}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error("append-dispatch-ledger: fatal:", e);
    process.exit(1);
  });
}
