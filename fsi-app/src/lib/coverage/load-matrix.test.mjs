// Proof for load-matrix.mjs (lane COV-1, 2026-10-08): the Coverage page is generated from the index through
// injected readers, and a failed read is an error state, never an empty matrix passed off as "nothing catalogued".
// Run: node --test fsi-app/src/lib/coverage/load-matrix.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCoverageMatrixWith, loadSurfaceDenominatorWith, COVERAGE_UNAVAILABLE } from "./load-matrix.mjs";

const NOW = "2026-10-08T09:00:00.000Z";
const ENTRIES = [
  { id: "a", jurisdiction: "EU", surfaces: ["regulations"], relevance: "firm", identity: "verified" },
  { id: "b", jurisdiction: "EU", surfaces: ["regulations"], relevance: "firm", identity: "pending" },
];
const INDEX = { counts: { total: 2, dualVerified: 1, verifiedBriefs: 9 }, entries: [], cap: 60 };

test("the matrix is generated from the fixture index: cells from the entries, verified briefs from the counts", async () => {
  const calls = [];
  const out = await loadCoverageMatrixWith({
    getEntries: async () => { calls.push("entries"); return ENTRIES; },
    getIndex: async () => { calls.push("index"); return INDEX; },
    now: () => NOW,
    labelOf: (c) => `L:${c}`,
  });
  assert.equal(out.error, null);
  assert.deepEqual(calls.sort(), ["entries", "index"]);
  assert.deepEqual(out.matrix.totals, { numerator: 1, denominator: 2 });
  assert.equal(out.matrix.verifiedBriefs, 9);
  assert.equal(out.matrix.generatedAt, NOW);
  assert.equal(out.matrix.geographies[0].label, "L:EU");
});

test("a throwing entry read yields the error state and an empty matrix of the same shape", async () => {
  const out = await loadCoverageMatrixWith({ getEntries: async () => { throw new Error("db down"); }, getIndex: async () => INDEX, now: () => NOW });
  assert.equal(out.error, COVERAGE_UNAVAILABLE);
  assert.deepEqual(out.matrix.cells, []);
  assert.equal(out.matrix.generatedAt, NOW);
});

test("an index that reports its own error is the error state, not zero coverage", async () => {
  const out = await loadCoverageMatrixWith({ getEntries: async () => ENTRIES, getIndex: async () => ({ counts: {}, _error: "Coverage index temporarily unavailable." }), now: () => NOW });
  assert.equal(out.error, COVERAGE_UNAVAILABLE);
  assert.deepEqual(out.matrix.totals, { numerator: 0, denominator: 0 });
});

test("the surface denominator comes from getCoverageIndex(surface), and a failure is an error state", async () => {
  const seen = [];
  const ok = await loadSurfaceDenominatorWith("regulations", { getIndex: async (s) => { seen.push(s); return INDEX; } });
  assert.deepEqual(seen, ["regulations"]);
  assert.deepEqual(ok.denominator, { surface: "regulations", label: "Regulations", numerator: 1, denominator: 2, verifiedBriefs: 9, href: "/dashboard/coverage?data_class=regulations" });
  assert.equal(ok.error, null);

  const thrown = await loadSurfaceDenominatorWith("research", { getIndex: async () => { throw new Error("x"); } });
  assert.deepEqual(thrown, { denominator: null, error: COVERAGE_UNAVAILABLE });
  const flagged = await loadSurfaceDenominatorWith("research", { getIndex: async () => ({ counts: {}, _error: "x" }) });
  assert.equal(flagged.error, COVERAGE_UNAVAILABLE);
  const unknownSurface = await loadSurfaceDenominatorWith("community", { getIndex: async () => INDEX });
  assert.equal(unknownSurface.denominator, null);
});
