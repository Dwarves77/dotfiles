// author-market-series-delta.test.mjs — proves authorMarketSeriesDeltaEdges()'s orchestration (which
// series_keys get a candidate pair, which outcome each is counted under) against injected fakes, mirroring
// run-envelope-producer.mjs's own authorAutomateVsHireForRegions test shape and author-edges.test.mjs's
// fakeClient. No real database, no real computeSeriesDeltas fake needed (the real one is pure and cheap —
// exercised directly so this test also proves the real wiring, not just a mock of it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorMarketSeriesDeltaEdges, assertEdgesAuthored } from "./author-market-series-delta.mjs";

const NOW = () => new Date("2026-08-29T00:00:00Z");

function makeRow(id, date, value, overrides = {}) {
  return {
    id,
    series_key: "eia-v2:wti-crude-rwtc",
    reference_period: date,
    as_at_date: date,
    value_numeric: value,
    unit: "$/BBL",
    currency: "USD",
    origin_class: "official",
    ...overrides,
  };
}

test("mode='dry' is a true no-op: no read, no author-edges call, for any input", async () => {
  let readCalled = false;
  let authorCalled = false;
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "dry", {
    readAllFn: async () => { readCalled = true; return []; },
    authorEdgesFn: async () => { authorCalled = true; return { ok: true, action: "authored", valueId: "x" }; },
    now: NOW,
    sb: {},
  });
  assert.equal(readCalled, false);
  assert.equal(authorCalled, false);
  assert.deepEqual(counts, {
    authored: 0, skippedAlready: 0, insufficientHistory: 0, unitMismatch: 0,
    refused: 0, unknownMethod: 0, errored: 0,
  });
});

test("empty series_keys iterable: no-op even in apply mode", async () => {
  const counts = await authorMarketSeriesDeltaEdges([], "apply", { now: NOW });
  assert.equal(counts.authored, 0);
});

test("apply: two real observations within the lookback window author one edge pair via authorEdges", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  const calls = [];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    authorEdgesFn: async (sb, figure) => { calls.push(figure); return { ok: true, action: "authored", valueId: "v-1" }; },
    now: NOW,
    sb: {},
  });
  assert.equal(counts.authored, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "market_series");
  assert.equal(calls[0].id, "ms-latest");
  assert.equal(calls[0].method.id, "market_series_delta");
  assert.deepEqual(
    calls[0].inputs.map((i) => i.pk).sort(),
    ["ms-latest", "ms-prior"],
  );
});

test("apply: already-authored pair is counted skippedAlready, never re-authored", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    authorEdgesFn: async () => ({ ok: true, action: "skipped-already-authored" }),
    now: NOW,
    sb: {},
  });
  assert.equal(counts.skippedAlready, 1);
  assert.equal(counts.authored, 0);
});

test("apply: fewer than 2 rows in the lookback window is counted insufficientHistory, never thrown", async () => {
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => [makeRow("ms-only", "2026-08-28", 63.5)],
    now: NOW,
    sb: {},
  });
  assert.equal(counts.insufficientHistory, 1);
});

test("apply: a unit change between the two points in-window is counted unitMismatch, never authored", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0, { unit: "EUR/1000L" })];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    now: NOW,
    sb: {},
  });
  assert.equal(counts.unitMismatch, 1);
  assert.equal(counts.authored, 0);
});

test("apply: an unknown-method refusal from authorEdges is counted separately from a data refusal", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    authorEdgesFn: async () => ({ ok: false, action: "unknown-method", reason: "not registered" }),
    now: NOW,
    sb: {},
  });
  assert.equal(counts.unknownMethod, 1);
});

test("apply: multiple series_keys are each authored independently, and a per-key read failure is isolated (errored), not fatal to the run", async () => {
  const rowsA = [makeRow("a-latest", "2026-08-28", 10, { series_key: "eia-v2:brent-crude-rbrte" }), makeRow("a-prior", "2026-08-21", 9, { series_key: "eia-v2:brent-crude-rbrte" })];
  let callIndex = 0;
  const counts = await authorMarketSeriesDeltaEdges(
    ["eia-v2:brent-crude-rbrte", "eia-v2:wti-crude-rwtc"],
    "apply",
    {
      readAllFn: async () => {
        callIndex += 1;
        if (callIndex === 1) return rowsA; // brent: resolves fine
        throw new Error("simulated network failure"); // wti: read itself throws
      },
      authorEdgesFn: async () => ({ ok: true, action: "authored", valueId: "v-brent" }),
      now: NOW,
      sb: {},
    },
  );
  assert.equal(counts.authored, 1);
  assert.equal(counts.errored, 1);
});

// ── trace (lane M5, 2026-09-18) ───────────────────────────────────────────────────────────────────────

test("trace disabled (default): no trace field on the returned counts", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    authorEdgesFn: async () => ({ ok: true, action: "authored", valueId: "v-1" }),
    now: NOW,
    sb: {},
  });
  assert.equal("trace" in counts, false);
});

test("trace enabled: records keys received, candidates, rows attempted, rows inserted", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  const counts = await authorMarketSeriesDeltaEdges(["eia-v2:wti-crude-rwtc"], "apply", {
    readAllFn: async () => rows,
    authorEdgesFn: async () => ({ ok: true, action: "authored", valueId: "v-1" }),
    now: NOW,
    sb: {},
    trace: true,
  });
  assert.ok(Array.isArray(counts.trace));
  assert.ok(counts.trace.some((l) => l.includes("keys received") && l.includes("eia-v2:wti-crude-rwtc")));
  assert.ok(counts.trace.some((l) => l.includes("candidates computed") && l.includes("2 row(s)")));
  assert.ok(counts.trace.some((l) => l.includes("rows attempted") && l.includes("latest=ms-latest") && l.includes("prior=ms-prior")));
  assert.ok(counts.trace.some((l) => l.includes("rows inserted") && l.includes("v-1")));
});

test("trace enabled: an insufficientHistory outcome and a caught error both land in the trace verbatim", async () => {
  let calls = 0;
  const counts = await authorMarketSeriesDeltaEdges(
    ["eia-v2:wti-crude-rwtc", "eia-v2:brent-crude-rbrte"],
    "apply",
    {
      readAllFn: async () => {
        calls += 1;
        if (calls === 1) return [makeRow("ms-only", "2026-08-28", 63.5)]; // insufficientHistory
        throw new Error("simulated read failure"); // errored
      },
      now: NOW,
      sb: {},
      trace: true,
    },
  );
  assert.equal(counts.insufficientHistory, 1);
  assert.equal(counts.errored, 1);
  assert.ok(counts.trace.some((l) => l.includes("outcome=insufficientHistory")));
  assert.ok(counts.trace.some((l) => l.includes("ERROR simulated read failure")));
});

// ── assertEdgesAuthored (lane M5, 2026-09-18: "the run is the gate") ─────────────────────────────────

test("assertEdgesAuthored: rows changed, zero edges authored -> throws", () => {
  assert.throws(
    () => assertEdgesAuthored({ rowsChanged: 4, edgesAuthored: 0 }),
    /wrote 4 row\(s\).*authored 0 derivation_edges/s,
  );
});

test("assertEdgesAuthored: rows changed, edges authored -> passes (no throw)", () => {
  assert.doesNotThrow(() => assertEdgesAuthored({ rowsChanged: 4, edgesAuthored: 2 }));
});

test("assertEdgesAuthored: zero rows changed, zero edges authored -> passes (no-op write, not this bug)", () => {
  assert.doesNotThrow(() => assertEdgesAuthored({ rowsChanged: 0, edgesAuthored: 0 }));
});

test("dedupes a repeated series_key in the input iterable", async () => {
  const rows = [makeRow("ms-latest", "2026-08-28", 63.5), makeRow("ms-prior", "2026-08-21", 61.0)];
  let reads = 0;
  const counts = await authorMarketSeriesDeltaEdges(
    ["eia-v2:wti-crude-rwtc", "eia-v2:wti-crude-rwtc"],
    "apply",
    {
      readAllFn: async () => { reads += 1; return rows; },
      authorEdgesFn: async () => ({ ok: true, action: "authored", valueId: "v" }),
      now: NOW,
      sb: {},
    },
  );
  assert.equal(reads, 1);
  assert.equal(counts.authored, 1);
});
