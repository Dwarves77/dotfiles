// Tests for rederive-record-provenance.mjs (Lane POP, 2026-09-02). node:test, no DB — deps injected.
// Run: node --test scripts/mint/rederive-record-provenance.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectStale, main, CITE } from "./rederive-record-provenance.mjs";

const ROWS = [
  { id: "a", provenance_status: "quarantined", item_grade: "record", is_archived: false },
  { id: "b", provenance_status: "quarantined", item_grade: "record", is_archived: false },
  { id: "c", provenance_status: "unverified", item_grade: "record", is_archived: false },
];

test("selectStale: only rows the derivation says are valid NOW are stale; a still-invalid row is left alone", () => {
  const verdicts = new Map([["a", { valid: true }], ["b", { valid: false, failures: [{ criterion: 2 }] }], ["c", { valid: true }]]);
  assert.deepEqual(selectStale(ROWS, verdicts).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(selectStale([{ id: "v", provenance_status: "verified" }], new Map([["v", { valid: true }]])), []);
});

test("main dry-run: reads record-grade non-verified rows, calls the rpc per row, touches nothing", async () => {
  const calls = [];
  const deps = {
    readAll: async (table, cols, opts) => { calls.push(["readAll", table]); return ROWS; },
    rpc: async (id) => { calls.push(["rpc", id]); return { valid: id !== "b" }; },
    guardedUpdateByIds: async () => { throw new Error("must not write in dry-run"); },
  };
  const r = await main({ apply: false }, deps);
  assert.deepEqual(r, { mode: "dry-run", candidates: 3, stale: 2, stillInvalid: 1, touched: 0 });
  assert.equal(calls.filter((c) => c[0] === "rpc").length, 3);
});

test("main apply: touches ONLY the stale ids through guardedUpdateByIds with the cite, patch is updated_at only (the trigger writes the status), re-reads the status with a fresh SELECT (run #9: the UPDATE's returning rows predate the AFTER trigger)", async () => {
  let captured;
  let reads = 0;
  const deps = {
    readAll: async (table, cols, opts) => {
      reads += 1;
      if (reads === 1) return ROWS; // the candidate scan
      // the post-touch re-read: the derivation has flipped them by now
      return ["a", "c"].map((id) => ({ id, provenance_status: "verified" }));
    },
    rpc: async (id) => ({ valid: id !== "b" }),
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      captured = { table, ids, patch, opts };
      // what Postgres RETURNING hands back: the pre-trigger tuple — still the OLD status
      return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) };
    },
  };
  const r = await main({ apply: true }, deps);
  assert.equal(captured.table, "intelligence_items");
  assert.deepEqual(captured.ids, ["a", "c"]);
  assert.deepEqual(Object.keys(captured.patch), ["updated_at"]);
  assert.equal(captured.opts.cite, CITE);
  assert.ok(typeof captured.opts.applyMatch === "function");
  assert.equal(r.healed, 2);
  assert.equal(r.touched, 2);
  assert.equal(reads, 2, "one candidate scan, one post-touch re-read");
  assert.notEqual(process.exitCode, 1);
});

test("main apply: nothing stale -> no write at all", async () => {
  const deps = {
    readAll: async () => [ROWS[1]],
    rpc: async () => ({ valid: false }),
    guardedUpdateByIds: async () => { throw new Error("must not write when nothing is stale"); },
  };
  const r = await main({ apply: true }, deps);
  assert.deepEqual(r, { mode: "apply", candidates: 1, stale: 0, stillInvalid: 1, touched: 0 });
});
