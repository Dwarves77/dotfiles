// close-acquire-primaries-holds.test.mjs -- dependency-injected, no database. Mirrors
// close-run-logs.test.mjs's shape (fake readCandidates/closeIds/readRemainingOpen).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planClosure, main, CREATED_BY, RESOLVED_BY, RESOLUTION_NOTE } from "./close-acquire-primaries-holds.mjs";

test("planClosure closes every candidate row (no per-row decision in this family)", () => {
  const rows = [
    { id: "a", created_by: CREATED_BY },
    { id: "b", created_by: CREATED_BY },
  ];
  const { toClose } = planClosure(rows);
  assert.equal(toClose.length, 2);
  assert.deepEqual(toClose.map((r) => r.id), ["a", "b"]);
  assert.ok(toClose.every((r) => r.reason.includes("no reader ever existed")));
});

test("planClosure on an empty candidate set closes nothing", () => {
  assert.deepEqual(planClosure([]).toClose, []);
  assert.deepEqual(planClosure(undefined).toClose, []);
});

test("main(dry) reports would_close and writes nothing", async () => {
  const rows = [{ id: "1", created_by: CREATED_BY }, { id: "2", created_by: CREATED_BY }];
  let closeCalled = false;
  const summary = await main(
    { mode: "dry" },
    {
      readCandidates: async () => rows,
      closeIds: async () => { closeCalled = true; return { updated: 0, snapshot: null }; },
      readRemainingOpen: async () => [],
    },
  );
  assert.equal(closeCalled, false);
  assert.equal(summary.counts.candidates_scanned, 2);
  assert.equal(summary.counts.would_close, 2);
  assert.equal(summary.applied, 0);
  assert.equal(summary.close_sample.length, 2);
  assert.match(summary.note, /DRY/);
});

test("main(apply) closes every candidate and reports the read-back", async () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({ id: `row-${i}`, created_by: CREATED_BY }));
  let closedIds = null;
  const summary = await main(
    { mode: "apply" },
    {
      readCandidates: async () => rows,
      closeIds: async (ids) => { closedIds = ids; return { updated: ids.length, snapshot: "scripts/_snapshots/fake.jsonl" }; },
      readRemainingOpen: async () => [],
    },
  );
  assert.equal(closedIds.length, 19);
  assert.equal(summary.applied, 19);
  assert.equal(summary.counts.write.updated, 19);
  assert.equal(summary.read_back.remaining_open, 0);
  assert.match(summary.note, /Closed 19\/19/);
});

test("main(apply) with zero candidates never calls closeIds", async () => {
  let called = false;
  const summary = await main(
    { mode: "apply" },
    {
      readCandidates: async () => [],
      closeIds: async () => { called = true; return { updated: 0, snapshot: null }; },
      readRemainingOpen: async () => [],
    },
  );
  assert.equal(called, false);
  assert.equal(summary.applied, 0);
});

test("idempotent (fix round 1, review-l11.md): a second apply over the SAME underlying rows writes nothing (rows actually close between runs)", async () => {
  const store = [
    { id: "1", created_by: CREATED_BY },
    { id: "2", created_by: CREATED_BY },
  ];
  const deps = {
    readCandidates: async () => store.filter((r) => !r.resolved),
    closeIds: async (ids) => {
      for (const row of store) if (ids.includes(row.id)) row.resolved = true;
      return { updated: ids.length, snapshot: "scripts/_snapshots/fake.jsonl" };
    },
    readRemainingOpen: async () => store.filter((r) => !r.resolved),
  };
  const first = await main({ mode: "apply" }, deps);
  assert.equal(first.applied, 2);
  assert.equal(first.read_back.remaining_open, 0);

  const second = await main({ mode: "apply" }, deps);
  assert.equal(second.applied, 0);
  assert.equal(second.counts.candidates_scanned, 0);
  assert.equal(second.counts.would_close, 0);
  assert.equal(second.read_back.remaining_open, 0);
});

test("resolution constants match the plan's exact ruling text", () => {
  assert.equal(CREATED_BY, "acquire-primaries-batch-2026-07-16");
  assert.equal(RESOLVED_BY, "close-acquire-primaries-holds");
  assert.match(RESOLUTION_NOTE, /superseded by the free capture path and provenance-heal \(task 7\.3\)/);
  assert.match(RESOLUTION_NOTE, /7\.3 residue report/);
});
