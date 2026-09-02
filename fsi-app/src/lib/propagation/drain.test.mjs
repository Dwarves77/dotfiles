// drain.test.mjs — proves runPropagationDrain()'s two-pass contract (invalidate, then recompute in apply
// mode only) and resolveInputs() against a hand-rolled in-memory fake client (no real database, no
// supabase-js — see drain.ts's own header on why this module has zero npm dependencies at module scope).
// Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPropagationDrain, resolveInputs } from "./drain.ts";
import { registerMethod, __clearRegistryForTests } from "./methods/index.ts";

test.beforeEach(() => {
  __clearRegistryForTests();
});

/** A minimal in-memory fake of the DrainClient surface (`.from(table)...`, `.rpc(fn, args)`), built from a
 *  plain `{tableName: row[]}` seed. Chainable filters (`select/is/eq/in/order/limit`) narrow an in-memory
 *  array; `update(values)` mutates matching rows in place (mirroring PostgREST's own semantics closely
 *  enough for this module's own read/write shapes); the builder is itself awaitable (`.then`), matching
 *  supabase-js's own thenable query builder, for the bare select/update calls drain.ts issues with no
 *  terminal row-shape call. `maybeSingle()` returns the first match or null. */
function fakeClient({ tables = {}, rpcHandlers = {} } = {}) {
  const state = structuredClone(tables);
  const rpcCalls = [];

  function builder(table) {
    const filters = [];
    let updateValues = null;
    let orderBy = null;
    let limitN = null;

    function applyFilters() {
      let rows = state[table] || [];
      for (const f of filters) rows = rows.filter(f);
      if (orderBy) {
        rows = [...rows].sort((a, b) => {
          const av = a[orderBy.col];
          const bv = b[orderBy.col];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return orderBy.ascending ? cmp : -cmp;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    async function execute() {
      const rows = applyFilters();
      if (updateValues) {
        for (const row of rows) Object.assign(row, updateValues);
      }
      return { data: rows, error: null };
    }

    const b = {
      select() { return b; },
      update(values) { updateValues = values; return b; },
      is(col, val) { filters.push((row) => row[col] === val); return b; },
      eq(col, val) { filters.push((row) => row[col] === val); return b; },
      in(col, vals) { filters.push((row) => vals.includes(row[col])); return b; },
      order(col, opts) { orderBy = { col, ascending: opts?.ascending !== false }; return b; },
      limit(n) { limitN = n; return b; },
      async maybeSingle() {
        const rows = applyFilters();
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
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

function invalidateHandler(countsByPk) {
  return ({ p_pk }) => ({ data: countsByPk[p_pk] ?? 0, error: null });
}

test("resolveInputs: a known table resolves the row via its PK column", async () => {
  const sb = fakeClient({ tables: { emission_factors: [{ factor_id: "ef-1", value: 42 }] } });
  const resolved = await resolveInputs(sb, [{ table: "emission_factors", pk: "ef-1" }]);
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0].row, { factor_id: "ef-1", value: 42 });
});

test("resolveInputs: a table outside the known allowlist resolves to row:null (never throws)", async () => {
  const sb = fakeClient({});
  const resolved = await resolveInputs(sb, [{ table: "not_a_real_table", pk: "x" }]);
  assert.equal(resolved[0].row, null);
});

test("resolveInputs: a pk that no longer exists resolves to row:null", async () => {
  const sb = fakeClient({ tables: { emission_factors: [] } });
  const resolved = await resolveInputs(sb, [{ table: "emission_factors", pk: "gone" }]);
  assert.equal(resolved[0].row, null);
});

test("runPropagationDrain: an empty queue returns a zeroed result and issues no rpc calls", async () => {
  const sb = fakeClient({ tables: { propagation_events: [] } });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry" });
  assert.equal(result.queueDepthBefore, 0);
  assert.equal(result.eventsConsidered, 0);
  assert.equal(sb.rpcCalls.length, 0);
});

test("runPropagationDrain dry mode: counts via invalidate_dependents(p_apply=false), writes NOTHING", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
        { event_id: 2, table_name: "market_series", row_pk: "ms-1", occurred_at: "2026-09-01T00:00:01Z", drained_at: null },
      ],
      derived_values: [],
    },
    rpcHandlers: {
      invalidate_dependents: invalidateHandler({ "ef-1": 3, "ms-1": 2 }),
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry" });

  assert.equal(result.mode, "dry");
  assert.equal(result.queueDepthBefore, 2);
  assert.equal(result.eventsConsidered, 2);
  assert.equal(result.invalidated, 5);
  assert.equal(result.eventsDrained, 0);
  assert.equal(result.recomputed, 0);
  // p_apply must have been false for BOTH calls
  const invalidateCalls = sb.rpcCalls.filter((c) => c.fn === "invalidate_dependents");
  assert.equal(invalidateCalls.length, 2);
  assert.ok(invalidateCalls.every((c) => c.args.p_apply === false));
  // nothing marked drained
  assert.ok(sb.state.propagation_events.every((e) => e.drained_at === null));
  // no register_derived_value RPC at all — dry mode never recomputes
  assert.equal(sb.rpcCalls.some((c) => c.fn === "register_derived_value"), false);
});

test("runPropagationDrain apply mode: invalidates, marks events drained, recomputes via a registered method", async () => {
  registerMethod("blend", "1", () => ({
    ok: true,
    value: 99,
    unit: "unit",
    derivation: "calculated",
    originClass: "derived",
    lifecycle: "verified",
    admissibility: "analysis_ok",
    confidence: 0.85,
  }));

  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [
        {
          value_id: "aaaaaaaa-0000-0000-0000-000000000001",
          entity_id: null,
          method_id: "blend",
          method_version: "1",
          inputs: [{ table: "emission_factors", pk: "ef-1" }],
          unit: "unit",
          currency: null,
          admissibility: "stale",
          invalidated_by_event: 1,
        },
      ],
      emission_factors: [{ factor_id: "ef-1", value: 10 }],
    },
    rpcHandlers: {
      invalidate_dependents: invalidateHandler({ "ef-1": 1 }),
      register_derived_value: () => ({ data: "bbbbbbbb-0000-0000-0000-000000000002", error: null }),
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });

  assert.equal(result.mode, "apply");
  assert.equal(result.invalidated, 1);
  assert.equal(result.eventsDrained, 1);
  assert.equal(result.recomputed, 1);
  assert.equal(result.skippedUnknownMethod, 0);
  assert.deepEqual(result.superseded, [{ from: "aaaaaaaa-0000-0000-0000-000000000001", to: "bbbbbbbb-0000-0000-0000-000000000002" }]);

  // the event was marked drained
  assert.notEqual(sb.state.propagation_events[0].drained_at, null);
  assert.ok(sb.state.propagation_events[0].drain_run_id.startsWith("test:"));

  // register_derived_value was called with supersedes pointing at the stale row
  const registerCall = sb.rpcCalls.find((c) => c.fn === "register_derived_value");
  assert.ok(registerCall);
  assert.equal(registerCall.args.p_supersedes, "aaaaaaaa-0000-0000-0000-000000000001");
  assert.equal(registerCall.args.p_value, 99);
  assert.equal(registerCall.args.p_computed_by, "blend@1");
});

test("runPropagationDrain apply mode: an unknown method is counted, not recomputed, and left stale", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [
        {
          value_id: "aaaaaaaa-0000-0000-0000-000000000001",
          entity_id: null,
          method_id: "nonexistent-method",
          method_version: "9",
          inputs: [],
          unit: null,
          currency: null,
          admissibility: "stale",
          invalidated_by_event: 1,
        },
      ],
    },
    rpcHandlers: { invalidate_dependents: invalidateHandler({ "ef-1": 1 }) },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.skippedUnknownMethod, 1);
  assert.equal(result.recomputed, 0);
  assert.equal(sb.rpcCalls.some((c) => c.fn === "register_derived_value"), false);
});

test("runPropagationDrain apply mode: a method that refuses to compute is counted separately from an unknown method", async () => {
  registerMethod("picky", "1", () => ({ ok: false, reason: "insufficient inputs" }));
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [
        {
          value_id: "aaaaaaaa-0000-0000-0000-000000000001",
          entity_id: null,
          method_id: "picky",
          method_version: "1",
          inputs: [],
          unit: null,
          currency: null,
          admissibility: "stale",
          invalidated_by_event: 1,
        },
      ],
    },
    rpcHandlers: { invalidate_dependents: invalidateHandler({ "ef-1": 1 }) },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.skippedMethodRefused, 1);
  assert.equal(result.skippedUnknownMethod, 0);
  assert.equal(result.recomputed, 0);
});

test("runPropagationDrain: an invalidate_dependents error for one event is recorded and does not abort the batch", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
        { event_id: 2, table_name: "emission_factors", row_pk: "ef-2", occurred_at: "2026-09-01T00:00:01Z", drained_at: null },
      ],
      derived_values: [],
    },
    rpcHandlers: {
      invalidate_dependents: ({ p_pk }) =>
        p_pk === "ef-1" ? { data: null, error: { message: "boom" } } : { data: 1, error: null },
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry" });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].eventId, 1);
  assert.equal(result.invalidated, 1); // event 2 still counted despite event 1's error
});

test("runPropagationDrain: batch caps how many undrained events one call considers", async () => {
  const events = Array.from({ length: 5 }, (_, i) => ({
    event_id: i + 1,
    table_name: "emission_factors",
    row_pk: `ef-${i + 1}`,
    occurred_at: `2026-09-01T00:00:0${i}Z`,
    drained_at: null,
  }));
  const sb = fakeClient({
    tables: { propagation_events: events, derived_values: [] },
    rpcHandlers: { invalidate_dependents: () => ({ data: 0, error: null }) },
  });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry", batch: 2 });
  assert.equal(result.queueDepthBefore, 5); // depth is the FULL queue...
  assert.equal(result.eventsConsidered, 2); // ...but only `batch` are processed this call
});
