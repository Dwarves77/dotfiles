// drain.test.mjs — proves runPropagationDrain()'s two-pass contract (invalidate, then recompute in apply
// mode only) and resolveInputs() against a hand-rolled in-memory fake client (no real database, no
// supabase-js — see drain.ts's own header on why this module has zero npm dependencies at module scope).
// Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPropagationDrain, resolveInputs } from "./drain.ts";
import { registerMethod, __clearRegistryForTests } from "./methods/index.ts";
import { METHOD_ID as INFER_METHOD_ID, METHOD_VERSION as INFER_METHOD_VERSION } from "./methods/infer-from-question.ts";

test.beforeEach(() => {
  __clearRegistryForTests();
});

/** A minimal in-memory fake of the DrainClient surface (`.from(table)...`, `.rpc(fn, args)`), built from a
 *  plain `{tableName: row[]}` seed. Chainable filters (`select/is/eq/in/order/limit`) narrow an in-memory
 *  array; `update(values)` mutates matching rows in place (mirroring PostgREST's own semantics closely
 *  enough for this module's own read/write shapes); the builder is itself awaitable (`.then`), matching
 *  supabase-js's own thenable query builder, for the bare select/update calls drain.ts issues with no
 *  terminal row-shape call. `maybeSingle()` returns the first match or null. */
function fakeClient({ tables = {}, rpcHandlers = {}, insertErrors = {} } = {}) {
  const state = structuredClone(tables);
  const rpcCalls = [];

  function builder(table) {
    const filters = [];
    let updateValues = null;
    let orderBy = null;
    let limitN = null;
    let countExactHead = false;

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
      // `select(cols, {count:'exact', head:true})` (paginate.mjs's exactCount contract): the fake reports
      // the TRUE filtered count (no 1000-row PostgREST cap to simulate at this scale) and no row payload,
      // matching supabase-js's own head:true shape.
      if (countExactHead) return { data: null, error: null, count: rows.length };
      return { data: rows, error: null };
    }

    const b = {
      select(_cols, opts) { if (opts && opts.count === "exact" && opts.head) countExactHead = true; return b; },
      update(values) { updateValues = values; return b; },
      // lane L4-B: an INSERT (the re-opened question flag); `insertErrors[table]` makes it fail.
      async insert(row) {
        if (insertErrors[table]) return { error: { message: insertErrors[table] } };
        (state[table] ?? (state[table] = [])).push({ ...row });
        return { error: null };
      },
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

test("runPropagationDrain: queue_depth_before is an exact COUNT, not the .length of a possibly-capped row page (CAP-1000)", async () => {
  // Regression for the defect this proposer pass found reading propagation-run-003/004/005's own
  // artifacts: a bare `.select("event_id").is(...)` with no `.limit()`/`.range()` reported
  // `queue_depth_before: 1000` on every one of those three runs because PostgREST silently caps a
  // range-less response at 1000 rows — the live table genuinely held 2,272-2,778 pending events at the
  // time. 1,200 undrained rows here (well past both the default `batch: 500` and the 1000-row PostgREST
  // cap this fake does not even simulate) proves `queueDepthBefore` now comes from `exactCount()`
  // (paginate.mjs), an independent COUNT(*), not from any fetched array's `.length`.
  const events = Array.from({ length: 1200 }, (_, i) => ({
    event_id: i + 1,
    table_name: "emission_factors",
    row_pk: `ef-${i}`,
    occurred_at: `2026-09-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    drained_at: null,
  }));
  const sb = fakeClient({ tables: { propagation_events: events } });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry", batch: 500 });
  assert.equal(result.queueDepthBefore, 1200);
  assert.equal(result.eventsConsidered, 500); // batch still caps how many this CALL considers
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

// ── Pass 2 dispatch on record kind (ADR-036, lane W2-G, coordinator ruling 2026-09-29) ──────────────────

test("runPropagationDrain apply mode: a stale inference_records row triggers INFERENCE_METHODS and register_inference_record, and NEVER touches derived_values", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "derived_values", row_pk: "dv-src-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [],
      inference_records: [
        {
          inference_id: "inf-1",
          subject_id: null,
          claim_text: "What changed: amendment?",
          cited_item_ids: ["item-a"],
          trigger_question_ref: "item-1:regulations:what",
          method_id: INFER_METHOD_ID,
          method_version: INFER_METHOD_VERSION,
          admissibility: "stale",
          invalidated_by_event: 1,
        },
      ],
      derivation_edges: [],
    },
    rpcHandlers: {
      invalidate_dependents: invalidateHandler({ "dv-src-1": 1 }),
      register_inference_record: () => ({ data: "inf-2", error: null }),
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });

  assert.equal(result.recomputed, 1);
  assert.equal(result.skippedUnknownMethod, 0);
  assert.deepEqual(result.superseded, [{ from: "inf-1", to: "inf-2" }]);

  // dispatched to register_inference_record, NEVER register_derived_value
  assert.ok(sb.rpcCalls.some((c) => c.fn === "register_inference_record"));
  assert.equal(sb.rpcCalls.some((c) => c.fn === "register_derived_value"), false);
  const call = sb.rpcCalls.find((c) => c.fn === "register_inference_record");
  assert.equal(call.args.p_supersedes, "inf-1");
  assert.equal(call.args.p_status_token, "HYPOTHESIS");
  assert.deepEqual(call.args.p_cited_item_ids, ["item-a"]);

  // derived_values table is untouched (still empty, no row ever inserted or read as a target)
  assert.deepEqual(sb.state.derived_values, []);
});

test("runPropagationDrain apply mode: a stale derived_values row NEVER dispatches through INFERENCE_METHODS and never touches inference_records", async () => {
  registerMethod("blend", "1", () => ({
    ok: true, value: 99, unit: "unit", derivation: "calculated", originClass: "derived",
    lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.85,
  }));
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [
        {
          value_id: "aaaaaaaa-0000-0000-0000-000000000001", entity_id: null, method_id: "blend", method_version: "1",
          inputs: [{ table: "emission_factors", pk: "ef-1" }], unit: "unit", currency: null,
          admissibility: "stale", invalidated_by_event: 1,
        },
      ],
      emission_factors: [{ factor_id: "ef-1", value: 10 }],
      inference_records: [], // present but empty, proves the numeric path never reads/writes it
    },
    rpcHandlers: {
      invalidate_dependents: invalidateHandler({ "ef-1": 1 }),
      register_derived_value: () => ({ data: "bbbbbbbb-0000-0000-0000-000000000002", error: null }),
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });

  assert.equal(result.recomputed, 1);
  assert.deepEqual(result.superseded, [{ from: "aaaaaaaa-0000-0000-0000-000000000001", to: "bbbbbbbb-0000-0000-0000-000000000002" }]);
  assert.ok(sb.rpcCalls.some((c) => c.fn === "register_derived_value"));
  assert.equal(sb.rpcCalls.some((c) => c.fn === "register_inference_record"), false);
  // inference_records table is untouched (still empty)
  assert.deepEqual(sb.state.inference_records, []);
});

test("runPropagationDrain apply mode: BOTH a stale derived_values row and a stale inference_records row dispatch independently in the same run", async () => {
  registerMethod("blend", "1", () => ({
    ok: true, value: 99, unit: "unit", derivation: "calculated", originClass: "derived",
    lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.85,
  }));
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "emission_factors", row_pk: "ef-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [
        {
          value_id: "aaaaaaaa-0000-0000-0000-000000000001", entity_id: null, method_id: "blend", method_version: "1",
          inputs: [], unit: "unit", currency: null, admissibility: "stale", invalidated_by_event: 1,
        },
      ],
      inference_records: [
        {
          inference_id: "inf-1", subject_id: null, claim_text: "claim", cited_item_ids: ["item-a"],
          trigger_question_ref: null, method_id: INFER_METHOD_ID, method_version: INFER_METHOD_VERSION,
          admissibility: "stale", invalidated_by_event: 1,
        },
      ],
      derivation_edges: [],
    },
    rpcHandlers: {
      invalidate_dependents: invalidateHandler({ "ef-1": 1 }),
      register_derived_value: () => ({ data: "new-dv", error: null }),
      register_inference_record: () => ({ data: "new-inf", error: null }),
    },
  });

  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });

  assert.equal(result.recomputed, 2);
  assert.deepEqual(result.superseded.sort((a, b) => a.from.localeCompare(b.from)), [
    { from: "aaaaaaaa-0000-0000-0000-000000000001", to: "new-dv" },
    { from: "inf-1", to: "new-inf" },
  ]);
  assert.ok(sb.rpcCalls.some((c) => c.fn === "register_derived_value"));
  assert.ok(sb.rpcCalls.some((c) => c.fn === "register_inference_record"));
});

test("resolveInferenceDeclaredInputs: reads derivation_edges filtered to to_table='inference_records', maps to InputRef shape", async () => {
  const { resolveInferenceDeclaredInputs } = await import("./drain.ts");
  const sb = fakeClient({
    tables: {
      derivation_edges: [
        { from_table: "derived_values", from_pk: "dv-1", to_table: "inference_records", to_value_id: "inf-1", edge_kind: "input" },
        { from_table: "derived_values", from_pk: "dv-2", to_table: "derived_values", to_value_id: "dv-3", edge_kind: "input" },
      ],
    },
  });
  const refs = await resolveInferenceDeclaredInputs(sb, "inf-1");
  assert.deepEqual(refs, [{ table: "derived_values", pk: "dv-1", version: null }]);
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

// ── processedEvents (lane L4-A, 2026-10-05): the runner raises questions on change from these ────────

test("runPropagationDrain: processedEvents carries event id, table, pk, entity and change_kind in dry mode (nothing drained)", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "derived_values", row_pk: "dv-1", entity_id: "cl:jurisdiction:aaaaaaaaaaaaaaaa", change_kind: "update", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
        { event_id: 2, table_name: "emission_factors", row_pk: "ef-1", entity_id: null, change_kind: "supersede", occurred_at: "2026-09-01T00:00:01Z", drained_at: null },
      ],
    },
    rpcHandlers: { invalidate_dependents: invalidateHandler({}) },
  });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry" });
  assert.deepEqual(result.processedEvents, [
    { eventId: 1, tableName: "derived_values", rowPk: "dv-1", entityId: "cl:jurisdiction:aaaaaaaaaaaaaaaa", changeKind: "update", occurredAt: "2026-09-01T00:00:00Z" },
    { eventId: 2, tableName: "emission_factors", rowPk: "ef-1", entityId: null, changeKind: "supersede", occurredAt: "2026-09-01T00:00:01Z" },
  ]);
  assert.equal(result.eventsDrained, 0);
});

test("runPropagationDrain: in apply mode only an event that was invalidated and marked drained is a processed event", async () => {
  const sb = fakeClient({
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "derived_values", row_pk: "ok", entity_id: "cl:jurisdiction:aaaaaaaaaaaaaaaa", change_kind: "update", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
        { event_id: 2, table_name: "derived_values", row_pk: "bad", entity_id: "cl:jurisdiction:aaaaaaaaaaaaaaaa", change_kind: "update", occurred_at: "2026-09-01T00:00:01Z", drained_at: null },
      ],
      derived_values: [],
      inference_records: [],
    },
    rpcHandlers: {
      invalidate_dependents: ({ p_pk }) => (p_pk === "bad" ? { data: null, error: { message: "boom" } } : { data: 0, error: null }),
    },
  });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.deepEqual(result.processedEvents.map((e) => e.eventId), [1]);
  assert.equal(result.eventsDrained, 1);
  assert.equal(result.errors.length, 1);
});

test("runPropagationDrain: an empty queue has an empty processedEvents list", async () => {
  const sb = fakeClient({ tables: { propagation_events: [] } });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "dry" });
  assert.deepEqual(result.processedEvents, []);
});

// ── lane L4-B: Pass 2b re-opens the question a recomputed inference answers (ADR-044) ────────────────────

function staleInferenceSeed(extra = {}) {
  return {
    tables: {
      propagation_events: [
        { event_id: 1, table_name: "derived_values", row_pk: "dv-src-1", occurred_at: "2026-09-01T00:00:00Z", drained_at: null },
      ],
      derived_values: [],
      inference_records: [
        {
          inference_id: "inf-1", subject_id: null, claim_text: "What changed: amendment?", cited_item_ids: ["item-a"],
          trigger_question_ref: "item-1:regulations:what", method_id: INFER_METHOD_ID, method_version: INFER_METHOD_VERSION,
          admissibility: "stale", invalidated_by_event: 1,
        },
      ],
      derivation_edges: [],
      intelligence_items: [{ id: "item-1", title: "Bonded amendment", domain: 1, item_type: "regulation", jurisdiction_iso: ["EU"] }],
      integrity_flags: [],
      ...extra,
    },
    rpcHandlers: { invalidate_dependents: invalidateHandler({ "dv-src-1": 1 }), register_inference_record: () => ({ data: "inf-2", error: null }) },
  };
}

test("runPropagationDrain apply mode: a recomputed inference re-opens its originating question (the generator's own open flag)", async () => {
  const sb = fakeClient(staleInferenceSeed());
  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.recomputed, 1);
  assert.equal(result.questionsReopened, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(sb.state.integrity_flags.length, 1);
  assert.equal(sb.state.integrity_flags[0].subject_ref, "item-1:regulations:what");
  assert.equal(sb.state.integrity_flags[0].created_by, "question:what");
  assert.equal(sb.state.integrity_flags[0].status, "open");
});

test("runPropagationDrain apply mode: an already-open question flag is not duplicated (same dedup rule)", async () => {
  const sb = fakeClient(staleInferenceSeed({ integrity_flags: [{ id: "f-1", subject_ref: "item-1:regulations:what", created_by: "question:what", status: "open" }] }));
  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.recomputed, 1);
  assert.equal(result.questionsReopened, 0);
  assert.equal(sb.state.integrity_flags.length, 1);
});

test("runPropagationDrain apply mode: a failure to re-open is a recorded error and never undoes the recompute", async () => {
  const sb = fakeClient({ ...staleInferenceSeed(), insertErrors: { integrity_flags: "insert denied" } });
  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.recomputed, 1);
  assert.deepEqual(result.superseded, [{ from: "inf-1", to: "inf-2" }]);
  assert.equal(result.questionsReopened, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /re-opening question item-1:regulations:what .* insert denied/);
});

test("runPropagationDrain: a recomputed inference with no question ref re-opens nothing, and a dry run never reaches Pass 2b", async () => {
  const seed = staleInferenceSeed();
  seed.tables.inference_records[0].trigger_question_ref = null;
  const sb = fakeClient(seed);
  const result = await runPropagationDrain(sb, { caller: "test", mode: "apply" });
  assert.equal(result.recomputed, 1);
  assert.equal(result.questionsReopened, 0);
  assert.equal(sb.state.integrity_flags.length, 0);
  const dry = await runPropagationDrain(fakeClient(staleInferenceSeed()), { caller: "test", mode: "dry" });
  assert.equal(dry.questionsReopened, 0);
});
