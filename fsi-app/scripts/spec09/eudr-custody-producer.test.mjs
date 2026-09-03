import { test } from "node:test";
import assert from "node:assert/strict";
import { main, CITE } from "./eudr-custody-producer.mjs";

test("dry run: zero to insert on both tables, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert_eudr_plot_claims, 0);
  assert.equal(s.counts.to_insert_custody_chains, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("apply run: exercises the guarded path with an empty batch and a valid cite", async () => {
  let called = null;
  const deps = { guardedInsertMany: async (table, rows, opts) => { called = { table, rows, opts }; return { inserted: 0 }; } };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(called.table, "eudr_plot_claims");
  assert.equal(called.opts.cite, CITE);
});
