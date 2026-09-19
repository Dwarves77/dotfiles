// append-dispatch-ledger.test.mjs -- unit tests for the pure row builder and the file-append, per
// brief-m9b.md item 1 ("pure row builder, unit-tested"). Lane M9b, 2026-09-18.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLedgerRow, appendLedgerRow } from "./append-dispatch-ledger.mjs";

test("buildLedgerRow: produces exactly the 7-field shape the existing 81 rows use", () => {
  const row = buildLedgerRow({
    date: "2026-09-18",
    workflow: "maintenance",
    step: "tier-opinions",
    mode: "dry",
    runId: 12345,
    outcome: "reported",
  });
  assert.deepEqual(Object.keys(row), ["date", "workflow", "step", "mode", "run_id", "outcome", "note"]);
  assert.equal(row.run_id, "12345", "runId is coerced to a string");
  assert.equal(row.note, "");
});

test("buildLedgerRow: folds artifactPath into note, never a new top-level field", () => {
  const row = buildLedgerRow({
    date: "2026-09-18",
    workflow: "maintenance",
    step: "tier-opinions",
    mode: "apply",
    runId: "999",
    outcome: "applied",
    note: "run #75",
    artifactPath: "scripts/harness-runs/maintenance/maintenance-run-001.json",
  });
  assert.deepEqual(Object.keys(row), ["date", "workflow", "step", "mode", "run_id", "outcome", "note"]);
  assert.equal(
    row.note,
    "run #75 artifact scripts/harness-runs/maintenance/maintenance-run-001.json",
  );
});

test("buildLedgerRow: artifactPath alone (no note) still folds cleanly, no leading space", () => {
  const row = buildLedgerRow({
    date: "2026-09-18",
    workflow: "maintenance",
    step: "all",
    mode: "dry",
    runId: "1",
    outcome: "reported",
    artifactPath: "scripts/harness-runs/maintenance/maintenance-run-002.json",
  });
  assert.equal(row.note, "artifact scripts/harness-runs/maintenance/maintenance-run-002.json");
});

test("buildLedgerRow: throws naming the missing field(s), writes nothing (fail closed)", () => {
  assert.throws(
    () => buildLedgerRow({ date: "2026-09-18", workflow: "maintenance", step: "all", mode: "dry" }),
    /missing required field\(s\): runId, outcome/,
  );
});

test("buildLedgerRow: an empty-string required field is treated as missing, not accepted", () => {
  assert.throws(
    () =>
      buildLedgerRow({
        date: "2026-09-18",
        workflow: "",
        step: "all",
        mode: "dry",
        runId: "1",
        outcome: "reported",
      }),
    /missing required field\(s\): workflow/,
  );
});

test("appendLedgerRow: appends one JSONL line without touching existing lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "dispatch-ledger-test-"));
  const ledgerPath = join(dir, "dispatch-ledger.jsonl");
  writeFileSync(ledgerPath, '{"date":"2026-09-07","workflow":"maintenance","step":"tier-opinions","mode":"dry","run_id":"1","outcome":"reported","note":"prior row"}\n');

  const row = buildLedgerRow({
    date: "2026-09-18",
    workflow: "maintenance",
    step: "tier-opinions",
    mode: "dry",
    runId: "2",
    outcome: "reported",
  });
  appendLedgerRow(row, ledgerPath);

  const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 2, "the prior row survives; one new line is added");
  assert.deepEqual(JSON.parse(lines[0]), {
    date: "2026-09-07",
    workflow: "maintenance",
    step: "tier-opinions",
    mode: "dry",
    run_id: "1",
    outcome: "reported",
    note: "prior row",
  });
  assert.deepEqual(JSON.parse(lines[1]), row);

  rmSync(dir, { recursive: true, force: true });
});

test("appendLedgerRow: refuses to create a new ledger file (fail closed against a typo'd path)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dispatch-ledger-test-"));
  const missingPath = join(dir, "does-not-exist.jsonl");
  assert.throws(
    () => appendLedgerRow(buildLedgerRow({
      date: "2026-09-18", workflow: "maintenance", step: "all", mode: "dry", runId: "1", outcome: "reported",
    }), missingPath),
    /does not exist -- refusing to create a new ledger file/,
  );
  rmSync(dir, { recursive: true, force: true });
});
