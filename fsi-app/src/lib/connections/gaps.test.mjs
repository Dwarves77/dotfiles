// Tests for gap detection (flywheel U2). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, parity by construction, same as U1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectGaps } from "./gaps.mjs";

const theme = (overrides = {}) => ({
  id: "a1",
  members: ["a1", "a2"],
  surfaces: [],
  pivots: [],
  dominantSignals: [],
  density: 1,
  convergence: 1,
  ...overrides,
});

test("jurisdiction-span gap: theme spans >=2 jurisdictions, profile's home jurisdiction absent", () => {
  const themes = [theme({ members: ["a1", "a2", "a3"] })];
  const jurisdictionsByMember = { a1: "EU", a2: "GB", a3: "EU" };
  const profile = { jurisdictions: { US: 5, EU: 1 } };
  const out = detectGaps(themes, { profile, jurisdictionsByMember });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "jurisdiction_span_gap");
  assert.equal(out[0].subject_ref, "a1");
  assert.equal(out[0].category, "coverage_gap");
  assert.equal(out[0].subject_type, "item");
  assert.deepEqual(out[0].evidence.spannedJurisdictions, ["EU", "GB"]);
  assert.equal(out[0].evidence.missingHome, "US");
});

test("jurisdiction-span gap: does NOT fire when the home jurisdiction IS present", () => {
  const themes = [theme({ members: ["a1", "a2"] })];
  const jurisdictionsByMember = { a1: "US", a2: "EU" };
  const profile = { jurisdictions: { US: 5, EU: 1 } };
  const out = detectGaps(themes, { profile, jurisdictionsByMember });
  assert.equal(out.filter((g) => g.type === "jurisdiction_span_gap").length, 0);
});

test("jurisdiction-span gap: does NOT fire on a single-jurisdiction theme (no real span)", () => {
  const themes = [theme({ members: ["a1", "a2"] })];
  const jurisdictionsByMember = { a1: "EU", a2: "EU" };
  const profile = { jurisdictions: { US: 5, EU: 1 } };
  const out = detectGaps(themes, { profile, jurisdictionsByMember });
  assert.equal(out.filter((g) => g.type === "jurisdiction_span_gap").length, 0);
});

test("jurisdiction-span gap: degrades to nothing when jurisdictionsByMember is absent", () => {
  const themes = [theme({ members: ["a1", "a2", "a3"] })];
  const profile = { jurisdictions: { US: 5 } };
  const out = detectGaps(themes, { profile });
  assert.deepEqual(out, []);
});

test("jurisdiction-span gap: degrades to nothing when the profile has only generic jurisdictions", () => {
  const themes = [theme({ members: ["a1", "a2"] })];
  const jurisdictionsByMember = { a1: "EU", a2: "GB" };
  const profile = { jurisdictions: { global: 1 } }; // DEFAULT_WORKSPACE_PROFILE shape
  const out = detectGaps(themes, { profile, jurisdictionsByMember });
  assert.deepEqual(out, []);
});

test("jurisdiction-span gap: ties in profile weight flag every tied home jurisdiction that's missing", () => {
  const themes = [theme({ members: ["a1", "a2"] })];
  const jurisdictionsByMember = { a1: "FR", a2: "DE" };
  const profile = { jurisdictions: { US: 3, CA: 3 } }; // tied top weight, both absent
  const out = detectGaps(themes, { profile, jurisdictionsByMember });
  const missing = out.filter((g) => g.type === "jurisdiction_span_gap").map((g) => g.evidence.missingHome).sort();
  assert.deepEqual(missing, ["CA", "US"]);
});

test("surface gap: regulations + research present, market absent → fires", () => {
  const themes = [theme({ surfaces: ["regulations", "research"] })];
  const out = detectGaps(themes);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "surface_gap");
  assert.equal(out[0].subject_ref, "a1");
});

test("surface gap: does NOT fire when market IS present", () => {
  const themes = [theme({ surfaces: ["regulations", "research", "market"] })];
  const out = detectGaps(themes);
  assert.equal(out.filter((g) => g.type === "surface_gap").length, 0);
});

test("surface gap: does NOT fire on regulations-only or research-only themes", () => {
  const themes = [theme({ id: "r1", surfaces: ["regulations"] }), theme({ id: "s1", surfaces: ["research"] })];
  const out = detectGaps(themes);
  assert.equal(out.filter((g) => g.type === "surface_gap").length, 0);
});

test("pivot/operations gap: >=3 members, no operations surface, real pivot → fires", () => {
  const themes = [theme({ members: ["a1", "a2", "a3"], surfaces: ["regulations", "market"], pivots: [{ id: "a2", centrality: 1.2 }] })];
  const out = detectGaps(themes);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "pivot_operations_gap");
  assert.equal(out[0].evidence.pivotId, "a2");
});

test("pivot/operations gap: does NOT fire when operations IS present", () => {
  const themes = [theme({ members: ["a1", "a2", "a3"], surfaces: ["regulations", "operations"], pivots: [{ id: "a2", centrality: 1.2 }] })];
  const out = detectGaps(themes);
  assert.equal(out.filter((g) => g.type === "pivot_operations_gap").length, 0);
});

test("pivot/operations gap: does NOT fire on a bare pair (no real pivot structure)", () => {
  const themes = [theme({ members: ["a1", "a2"], surfaces: ["regulations"], pivots: [{ id: "a1", centrality: 0.5 }] })];
  const out = detectGaps(themes);
  assert.equal(out.filter((g) => g.type === "pivot_operations_gap").length, 0);
});

test("empty and degenerate inputs never throw, never invent gaps", () => {
  assert.deepEqual(detectGaps([]), []);
  assert.deepEqual(detectGaps(undefined), []);
  assert.doesNotThrow(() => detectGaps([null, {}, { id: "x" }]));
  assert.deepEqual(detectGaps([null, {}, { id: "x" }]), []);
});

test("output is deterministic under theme-order permutation (sorted by subject_ref then type)", () => {
  const themes = [
    theme({ id: "b1", surfaces: ["regulations", "research"] }),
    theme({ id: "a1", members: ["a1", "a2", "a3"], surfaces: ["market"], pivots: [{ id: "a1", centrality: 1 }] }),
  ];
  const out1 = detectGaps(themes);
  const out2 = detectGaps([...themes].reverse());
  assert.deepEqual(out1, out2);
  assert.deepEqual(out1.map((g) => g.subject_ref), ["a1", "b1"]);
});
