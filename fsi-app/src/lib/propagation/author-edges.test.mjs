// author-edges.test.mjs — proves authorEdges()'s contract against a hand-rolled in-memory fake client (no
// real database) and injected fakes for getMethod/resolveInputs/registerDerivedValue where a test needs to
// observe exactly what author-edges hands them. Pure. Mirrors drain.test.mjs's own fakeClient shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorEdges, hasBeenAuthored } from "./author-edges.mjs";
import { registerMethod, __clearRegistryForTests } from "./methods/index.ts";

test.beforeEach(() => {
  __clearRegistryForTests();
});

/** Minimal in-memory fake of the {from,rpc} surface author-edges.mjs needs — select/eq/in/limit narrow a
 *  plain {tableName: row[]} seed; the builder is itself awaitable (thenable), matching drain.test.mjs's
 *  own fakeClient. */
function fakeClient({ tables = {}, rpcHandlers = {} } = {}) {
  const state = structuredClone(tables);
  const rpcCalls = [];

  function builder(table) {
    const filters = [];
    let limitN = null;

    function applyFilters() {
      let rows = state[table] || [];
      for (const f of filters) rows = rows.filter(f);
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    const b = {
      select() { return b; },
      eq(col, val) { filters.push((row) => row[col] === val); return b; },
      in(col, vals) { filters.push((row) => vals.includes(row[col])); return b; },
      limit(n) { limitN = n; return b; },
      then(resolve, reject) {
        return Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject);
      },
    };
    return b;
  }

  return {
    state,
    rpcCalls,
    from: builder,
    async rpc(fn, args) {
      rpcCalls.push({ fn, args });
      const handler = rpcHandlers[fn];
      if (handler) return handler(args);
      return { data: null, error: { message: `fakeClient: no rpc handler registered for "${fn}"` } };
    },
  };
}

const OK_METHOD = ({ inputs }) => ({
  ok: true,
  value: 42,
  unit: "g/tkm",
  derivation: "calculated",
  originClass: "derived",
  lifecycle: "verified",
  admissibility: "calculation_ok",
  confidence: 0.9,
  halfLifeDays: null,
});

const FIGURE = {
  table: "emission_factors",
  id: "ef-1",
  entity: null,
  method: { id: "carbon_intensity_tkm", version: "1.0.0" },
  inputs: [{ table: "emission_factors", pk: "ef-1" }],
};

test("authorEdges: invalid input shapes are refused before touching the client", async () => {
  const sb = fakeClient({});
  const r1 = await authorEdges(sb, { ...FIGURE, table: "" });
  assert.equal(r1.ok, false);
  assert.equal(r1.action, "invalid-input");

  const r2 = await authorEdges(sb, { ...FIGURE, method: { id: "x" } });
  assert.equal(r2.ok, false);
  assert.equal(r2.action, "invalid-input");

  const r3 = await authorEdges(sb, { ...FIGURE, inputs: [] });
  assert.equal(r3.ok, false);
  assert.equal(r3.action, "invalid-input");

  const r4 = await authorEdges(sb, { ...FIGURE, inputs: [{ table: "emission_factors" }] });
  assert.equal(r4.ok, false);
  assert.equal(r4.action, "invalid-input");
});

test("authorEdges: an unregistered method is reported, never guessed", async () => {
  const sb = fakeClient({ tables: { derivation_edges: [], derived_values: [] } });
  const result = await authorEdges(sb, FIGURE);
  assert.equal(result.ok, false);
  assert.equal(result.action, "unknown-method");
  assert.match(result.reason, /carbon_intensity_tkm@1\.0\.0/);
});

test("authorEdges: a registered method that refuses to compute is reported, never thrown", async () => {
  registerMethod("carbon_intensity_tkm", "1.0.0", () => ({ ok: false, reason: "no usable ttw/wtw/wtt number" }));
  const sb = fakeClient({ tables: { derivation_edges: [], derived_values: [], emission_factors: [{ factor_id: "ef-1" }] } });
  const result = await authorEdges(sb, FIGURE);
  assert.equal(result.ok, false);
  assert.equal(result.action, "method-refused");
  assert.equal(result.reason, "no usable ttw/wtw/wtt number");
});

test("authorEdges: first call authors a real derived_values row via register_derived_value RPC", async () => {
  registerMethod("carbon_intensity_tkm", "1.0.0", OK_METHOD);
  const sb = fakeClient({
    tables: { derivation_edges: [], derived_values: [], emission_factors: [{ factor_id: "ef-1" }] },
    rpcHandlers: { register_derived_value: () => ({ data: "new-value-id", error: null }) },
  });
  const result = await authorEdges(sb, FIGURE);
  assert.equal(result.ok, true);
  assert.equal(result.action, "authored");
  assert.equal(result.valueId, "new-value-id");
  assert.equal(sb.rpcCalls.length, 1);
  assert.equal(sb.rpcCalls[0].fn, "register_derived_value");
  assert.equal(sb.rpcCalls[0].args.p_method_id, "carbon_intensity_tkm");
  assert.equal(sb.rpcCalls[0].args.p_computed_by, "carbon_intensity_tkm@1.0.0:author-edges:emission_factors:ef-1");
});

test("authorEdges: idempotent — a second call for the SAME input, same method, is a no-op", async () => {
  registerMethod("carbon_intensity_tkm", "1.0.0", OK_METHOD);
  const sb = fakeClient({
    tables: {
      derivation_edges: [{ from_table: "emission_factors", from_pk: "ef-1", to_value_id: "existing-value-id", edge_kind: "input" }],
      derived_values: [{ value_id: "existing-value-id", method_id: "carbon_intensity_tkm", method_version: "1.0.0" }],
      emission_factors: [{ factor_id: "ef-1" }],
    },
    rpcHandlers: { register_derived_value: () => { throw new Error("must not be called"); } },
  });
  const result = await authorEdges(sb, FIGURE);
  assert.equal(result.ok, true);
  assert.equal(result.action, "skipped-already-authored");
  assert.equal(sb.rpcCalls.length, 0);
});

test("authorEdges: a DIFFERENT method over the same input is NOT blocked by an existing edge for another method", async () => {
  registerMethod("some_other_method", "2.0.0", OK_METHOD);
  const sb = fakeClient({
    tables: {
      // an existing edge for carbon_intensity_tkm must not block a call for a different method
      derivation_edges: [{ from_table: "emission_factors", from_pk: "ef-1", to_value_id: "v1", edge_kind: "input" }],
      derived_values: [{ value_id: "v1", method_id: "carbon_intensity_tkm", method_version: "1.0.0" }],
      emission_factors: [{ factor_id: "ef-1" }],
    },
    rpcHandlers: { register_derived_value: () => ({ data: "v2", error: null }) },
  });
  const result = await authorEdges(sb, { ...FIGURE, method: { id: "some_other_method", version: "2.0.0" } });
  assert.equal(result.ok, true);
  assert.equal(result.action, "authored");
});

test("authorEdges: idempotency checks EVERY declared input, not only the primary {table,id} (automate_vs_hire shape)", async () => {
  registerMethod("automate_vs_hire", "1.0.0", OK_METHOD);
  const sb = fakeClient({
    tables: {
      // the ENERGY input (not the wage input named as the landed figure) already carries an edge for
      // this method — a producer re-run that lands the wage row again must still no-op.
      derivation_edges: [{ from_table: "regional_data_facts", from_pk: "energy-1", to_value_id: "v1", edge_kind: "input" }],
      derived_values: [{ value_id: "v1", method_id: "automate_vs_hire", method_version: "1.0.0" }],
      regional_data_facts: [{ id: "wage-1" }, { id: "energy-1" }],
    },
    rpcHandlers: { register_derived_value: () => { throw new Error("must not be called"); } },
  });
  const figure = {
    table: "regional_data_facts",
    id: "wage-1",
    entity: "cl:jurisdiction:abc",
    method: { id: "automate_vs_hire", version: "1.0.0" },
    inputs: [
      { table: "regional_data_facts", pk: "wage-1" },
      { table: "regional_data_facts", pk: "energy-1" },
    ],
  };
  const result = await authorEdges(sb, figure);
  assert.equal(result.ok, true);
  assert.equal(result.action, "skipped-already-authored");
});

test("hasBeenAuthored: false when no derivation_edges row exists for the input at all", async () => {
  const sb = fakeClient({ tables: { derivation_edges: [] } });
  const result = await hasBeenAuthored(sb, [{ table: "emission_factors", pk: "ef-1" }], "carbon_intensity_tkm", "1.0.0");
  assert.equal(result, false);
});
