// write-edges.test.mjs — proves the origin-ownership guard (the correctness claim, not just idempotency).
// Portable: node: builtins + a relative .mjs import only (no @/ alias, no npm deps) so it runs in the
// no-npm-ci discipline suite, which globs src/lib/connections/*.test.mjs (joins by construction).

import test from "node:test";
import assert from "node:assert/strict";
import { writeDiscoveredEdges } from "./write-edges.mjs";

// Minimal fake Supabase client: one page of existing edges on read, captures every upsert batch.
function fakeClient(existing, captured, { upsertError = null } = {}) {
  return {
    from() {
      return {
        select() { return this; },
        order() { return this; },
        range(from) { return Promise.resolve({ data: from === 0 ? existing : [], error: null }); },
        upsert(batch, opts) { captured.push({ batch, opts }); return Promise.resolve({ error: upsertError }); },
      };
    },
  };
}

const edge = (s, t, score = 0.5) => ({
  source_item_id: s, target_item_id: t, relationship: "related",
  origin: "provenance_discovery", basis: [{ signal: "shared_source" }], score,
});

test("origin ownership: skip foreign-origin pairs, refresh own, insert absent", async () => {
  const existing = [
    { source_item_id: "A", target_item_id: "B", origin: "agent_semantic" },       // foreign → must NOT clobber
    { source_item_id: "C", target_item_id: "D", origin: "entity_extraction" },    // foreign → must NOT clobber
    { source_item_id: "E", target_item_id: "F", origin: "provenance_discovery" }, // ours    → refresh
  ];
  const captured = [];
  const r = await writeDiscoveredEdges(fakeClient(existing, captured), [
    edge("A", "B"), // existing agent_semantic → skip
    edge("E", "F"), // existing ours          → refresh
    edge("G", "H"), // absent                 → insert
  ]);

  assert.equal(r.skippedForeignOrigin, 1, "the agent_semantic pair (A,B) is skipped");
  assert.equal(r.refreshed, 1, "the provenance_discovery pair (E,F) is a refresh");
  assert.equal(r.inserted, 1, "the absent pair (G,H) is an insert");
  assert.equal(r.written, 2, "exactly 2 rows written (refresh + insert)");
  assert.equal(r.failedChunks, 0);

  const written = captured.flatMap((c) => c.batch).map((e) => `${e.source_item_id}${e.target_item_id}`).sort();
  assert.deepEqual(written, ["EF", "GH"], "upsert payload is exactly the writable pairs");
  assert.ok(!written.includes("AB"), "the pre-existing agent_semantic edge (A,B) is never overwritten");
});

test("upsert targets the (source,target) unique constraint", async () => {
  const captured = [];
  await writeDiscoveredEdges(fakeClient([], captured), [edge("G", "H")]);
  assert.equal(captured[0].opts.onConflict, "source_item_id,target_item_id");
});

test("no-op on empty input — no read, no write", async () => {
  const captured = [];
  const r = await writeDiscoveredEdges(fakeClient([], captured), []);
  assert.equal(r.written, 0);
  assert.equal(captured.length, 0, "empty input never issues an upsert");
});

test("a failed chunk is counted, not thrown (non-gating)", async () => {
  const captured = [];
  const sb = fakeClient([], captured, { upsertError: { message: "boom" } });
  const r = await writeDiscoveredEdges(sb, [edge("G", "H")]);
  assert.equal(r.failedChunks, 1);
  assert.equal(r.written, 0, "a failed chunk contributes 0 written");
});
