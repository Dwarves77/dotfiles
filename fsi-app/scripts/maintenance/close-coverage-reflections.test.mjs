// close-coverage-reflections.test.mjs -- dependency-injected, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planClosure, main, RESOLVED_BY, RESOLUTION_NOTE } from "./close-coverage-reflections.mjs";

test("planClosure: every row closes, grouped by family (gap vs anticipate)", () => {
  const rows = [
    { id: "1", created_by: "flywheel-gap:jurisdiction_span_gap" },
    { id: "2", created_by: "flywheel-anticipate:some_reason" },
    { id: "3", created_by: "flywheel-gap:surface_gap" },
  ];
  const { toClose } = planClosure(rows);
  assert.equal(toClose.length, 3);
  assert.equal(toClose[0].family, "coverage-gap");
  assert.equal(toClose[1].family, "anticipated-coverage");
  assert.equal(toClose[2].family, "coverage-gap");
});

test("planClosure: empty input closes nothing", () => {
  assert.deepEqual(planClosure([]).toClose, []);
});

test("main(dry): reports by-family counts, writes nothing", async () => {
  const rows = [
    { id: "1", created_by: "flywheel-gap:a" },
    { id: "2", created_by: "flywheel-gap:b" },
    { id: "3", created_by: "flywheel-anticipate:c" },
  ];
  let closed = false;
  const summary = await main(
    { mode: "dry" },
    {
      readCandidates: async () => rows,
      closeIds: async () => { closed = true; return { updated: 0, snapshot: null }; },
      readRemainingOpen: async () => [],
    },
  );
  assert.equal(closed, false);
  assert.equal(summary.counts.would_close, 3);
  assert.equal(summary.counts.by_family["coverage-gap"], 2);
  assert.equal(summary.counts.by_family["anticipated-coverage"], 1);
});

test("main(apply): closes the 24-row backlog shape (18 gap + 6 anticipate) with the fixed resolution", async () => {
  const rows = [
    ...Array.from({ length: 18 }, (_, i) => ({ id: `gap-${i}`, created_by: "flywheel-gap:x" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `ant-${i}`, created_by: "flywheel-anticipate:y" })),
  ];
  let closedIds = null;
  const summary = await main(
    { mode: "apply" },
    {
      readCandidates: async () => rows,
      closeIds: async (ids) => { closedIds = ids; return { updated: ids.length, snapshot: "scripts/_snapshots/fake.jsonl" }; },
      readRemainingOpen: async () => [],
    },
  );
  assert.equal(closedIds.length, 24);
  assert.equal(summary.applied, 24);
  assert.equal(summary.counts.by_family["coverage-gap"], 18);
  assert.equal(summary.counts.by_family["anticipated-coverage"], 6);
  assert.equal(summary.read_back.remaining_open, 0);
});

test("resolution constants match the plan's exact ruling text", () => {
  assert.equal(RESOLVED_BY, "close-coverage-reflections");
  assert.equal(RESOLUTION_NOTE, "reflected in the coverage view; no per-row decision pending");
});
