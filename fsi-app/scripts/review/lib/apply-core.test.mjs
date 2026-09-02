// Run: node --test scripts/review/lib/apply-core.test.mjs — no DB, deps injected (fakes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySimpleQueue } from "./apply-core.mjs";
import * as ProvisionalSources from "./provisional-sources.mjs";

const CITE = { skill: "test", reason: "test" };
const LIVE_ROWS = [
  { id: "s1", url: "https://a.gov/x", status: "provisional", updated_at: "2026-09-01T00:00:00Z" },
  { id: "s2", url: "https://b.gov/x", status: "provisional", updated_at: "2026-09-01T00:00:00Z" },
];

function fakeDeps(calls, { rows = LIVE_ROWS } = {}) {
  return {
    readAll: async (table, cols, opts) => { calls.push(["readAll", table]); return rows; },
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push(["guardedUpdateByIds", table, ids, patch, opts]);
      return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) };
    },
  };
}

test("validation: a ruling with a missing decision is refused before any DB call", async () => {
  const calls = [];
  const ruling = { queue: "provisional-sources", generated_at: "2026-09-02T00:00:00Z", groups: [{ key: "g1", row_ids: ["s1"], decision: null }] };
  await assert.rejects(
    applySimpleQueue({ module: ProvisionalSources, ruling, apply: true, deps: fakeDeps(calls), cite: CITE }),
    /decision is missing/
  );
  assert.deepEqual(calls, []); // refused before any read/write
});

test("stale-ruling guard: refuses when a live row is newer than the ruling", async () => {
  const calls = [];
  const ruling = { queue: "provisional-sources", generated_at: "2026-08-01T00:00:00Z", groups: [{ key: "g1", row_ids: ["s1"], decision: "keep" }] };
  await assert.rejects(
    applySimpleQueue({ module: ProvisionalSources, ruling, apply: true, deps: fakeDeps(calls), cite: CITE }),
    /STALE/
  );
});

test("dry-run: never calls guardedUpdateByIds", async () => {
  const calls = [];
  const ruling = { queue: "provisional-sources", generated_at: "2026-09-02T00:00:00Z", groups: [{ key: "g1", row_ids: ["s1"], decision: "keep" }] };
  const res = await applySimpleQueue({ module: ProvisionalSources, ruling, apply: false, deps: fakeDeps(calls), cite: CITE });
  assert.equal(res.mode, "dry-run");
  assert.ok(!calls.some((c) => c[0] === "guardedUpdateByIds"));
  assert.deepEqual(res.results[0], { key: "g1", decision: "keep", would_apply: 1 });
});

test("apply: calls guardedUpdateByIds with the guarded-path call shape (table, ids, patch, {cite, select, applyMatch})", async () => {
  const calls = [];
  const ruling = {
    queue: "provisional-sources",
    generated_at: "2026-09-02T00:00:00Z",
    groups: [
      { key: "g1", row_ids: ["s1"], decision: "keep" },
      { key: "g2", row_ids: ["s2"], decision: "suspend" },
      { key: "g3", row_ids: ["s1"], decision: "skip" },
    ],
  };
  const res = await applySimpleQueue({ module: ProvisionalSources, ruling, apply: true, deps: fakeDeps(calls), cite: CITE });
  const writes = calls.filter((c) => c[0] === "guardedUpdateByIds");
  assert.equal(writes.length, 2); // "skip" never writes
  assert.deepEqual(writes[0], ["guardedUpdateByIds", "sources", ["s1"], { status: "active" }, { cite: CITE, select: "id", applyMatch: ProvisionalSources.matchQueue }]);
  assert.deepEqual(writes[1], ["guardedUpdateByIds", "sources", ["s2"], { status: "suspended" }, { cite: CITE, select: "id", applyMatch: ProvisionalSources.matchQueue }]);
  assert.deepEqual(res.results.find((r) => r.key === "g3"), { key: "g3", decision: "skip", applied: 0, skipped: true });
});

test("ruling.queue mismatch is refused", async () => {
  const calls = [];
  const ruling = { queue: "wrong-queue", generated_at: "2026-09-02T00:00:00Z", groups: [{ key: "g1", row_ids: ["s1"], decision: "keep" }] };
  await assert.rejects(applySimpleQueue({ module: ProvisionalSources, ruling, apply: true, deps: fakeDeps(calls), cite: CITE }), /does not match/);
});
