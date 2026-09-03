import { test } from "node:test";
import assert from "node:assert/strict";
import { main, CITE } from "./indexation-producer.mjs";

test("dry run: zero to insert, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("dry run: carries a computed worked example (spec 09 §1.3's own requirement)", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.worked_example.result.label, "estimate");
  assert.equal(typeof s.worked_example.result.value, "number");
});

test("apply run: exercises the guarded path with an empty batch and a valid cite", async () => {
  let called = null;
  const deps = { guardedInsertMany: async (table, rows, opts) => { called = { table, rows, opts }; return { inserted: 0 }; } };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(called.table, "indexation_clauses");
  assert.equal(called.opts.cite, CITE);
});
