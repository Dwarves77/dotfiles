import { test } from "node:test";
import assert from "node:assert/strict";
import { main, CITE } from "./surcharge-audit-producer.mjs";

test("dry run: reports zero to insert, writes nothing, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.mode, "dry");
  assert.equal(s.counts.to_insert_surcharge_audits, 0);
  assert.equal(s.counts.to_insert_carrier_compliance_pools, 0);
  assert.equal(s.applied, 0);
  assert.match(s.gap, /SOURCES\.md/);
  assert.equal(s.exitCode, 0);
});

test("apply run: exercises the guarded path with an empty batch, still requires a cite", async () => {
  const calls = [];
  const deps = {
    guardedInsertMany: async (table, rows, opts) => {
      calls.push({ table, rows, opts });
      if (!opts?.cite?.skill || !opts?.cite?.reason) throw new Error("missing cite");
      return { inserted: 0, snapshot: null, rows: [] };
    },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "surcharge_audits");
  assert.deepEqual(calls[0].rows, []);
  assert.equal(calls[0].opts.cite, CITE);
});

test("apply run with no deps.guardedInsertMany: does not throw, applied stays 0", async () => {
  const s = await main({ mode: "apply" }, {});
  assert.equal(s.applied, 0);
});
