// statutory-fueleu-annex-iv-2026-09-05.test.mjs — proves the §0 "Run" evidence this lane's REPORT claims:
// a dry run of write-statutory.mjs over THIS LANE'S OWN rows-file (read from disk, not re-typed inline)
// computes a real Annex IV penalty for its fixture row, with no DB access. This is the local, fixture-
// provable proof named by the coordinator dispatch guidance for a run that otherwise needs a live DB
// (write-statutory.mjs's CLI reads live `entities` even in --dry mode to preview mint ids, which this
// worktree has no credentials for — see write-statutory.mjs's own resolveOrMintEntity()).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRow, writeOneRow, SUPPORTED_TARGET_YEARS } from "../propagation/write-statutory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROWS_FILE = resolve(HERE, "statutory-fueleu-annex-iv-2026-09-05.json");

test("the rows-file parses as JSON with a non-empty rows[] array", () => {
  const raw = JSON.parse(readFileSync(ROWS_FILE, "utf8"));
  assert.ok(Array.isArray(raw.rows) && raw.rows.length >= 1, "rows-file must carry at least one row");
});

test("the rows-file states plainly, in its own metadata, that it is a fixture and names the real-data path", () => {
  const raw = JSON.parse(readFileSync(ROWS_FILE, "utf8"));
  assert.match(raw._file_status, /FIXTURE/);
  assert.match(raw._file_status, /BROWSER-WORKLIST/);
  for (const row of raw.rows) {
    assert.match(row.shipKey, /^FIXTURE-/, "a fixture row's shipKey must be unmistakably synthetic");
  }
});

test("every row's targetYear is one write-statutory.mjs actually SUPPORTS (never an unconfirmed year)", () => {
  const raw = JSON.parse(readFileSync(ROWS_FILE, "utf8"));
  for (const row of raw.rows) {
    assert.ok(Object.prototype.hasOwnProperty.call(SUPPORTED_TARGET_YEARS, String(row.targetYear)), `targetYear ${row.targetYear} is not in SUPPORTED_TARGET_YEARS`);
  }
});

test("parseRow accepts every row in the file without a structural refusal", () => {
  const raw = JSON.parse(readFileSync(ROWS_FILE, "utf8"));
  raw.rows.forEach((row, i) => assert.doesNotThrow(() => parseRow(row, i), `row[${i}] failed to parse`));
});

// ── the actual §0 "Run" proof: a dry run computes a real penalty for the fixture, with zero DB access ──

function fakeSb() {
  return { from() { throw new Error("fakeSb: this dry run must never touch the DB directly — resolveEntityFn is injected instead"); } };
}

test("dry run over THIS FILE's fixture row computes a positive Annex IV penalty, refuses nothing, writes nothing", async () => {
  const raw = JSON.parse(readFileSync(ROWS_FILE, "utf8"));
  const parsed = parseRow(raw.rows[0], 0);

  let insertCalled = false;
  const out = await writeOneRow(fakeSb(), parsed, "dry", {
    now: () => new Date("2026-09-05"),
    resolveEntityFn: async (_sb, { kind, seed }) => `cl:${kind}:${seed}`, // preview only, matches --dry's own "no mint" contract
    readAllFn: async () => [], // no prior computation on file
    insertFn: async () => { insertCalled = true; },
  });

  assert.equal(out.action, "would-write", `expected a computed dry-run row, got ${out.action}${out.reason ? `: ${out.reason}` : ""}`);
  assert.equal(insertCalled, false, "a dry run must never write");
  assert.ok(Number.isFinite(out.resultEur) && out.resultEur > 0, `expected a positive penalty (actual 95.0 > target 89.3368), got ${out.resultEur}`);
  assert.equal(out.shipKey, "FIXTURE-PIPELINE-PROOF-1");
});
