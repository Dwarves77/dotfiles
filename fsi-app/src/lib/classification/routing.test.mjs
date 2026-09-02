// routing.test.mjs — proves Axis 5's three primitives: source-aware item routing (5a), drift detection
// (5b), and anomaly flagging (5c), against the framework's own worked examples where practical.
import test from "node:test";
import assert from "node:assert/strict";
import {
  routeItemBySourceAxis5, isAnomalousCategory, detectDrift, observedDistributionFromItems,
} from "./routing.mjs";
import { AXIS5_CATEGORIES, AXIS5_OUT_OF_SCOPE } from "./vocab.mjs";
import { expectedOutputForRole } from "./expected-output.mjs";

// ── 5a. routeItemBySourceAxis5 ───────────────────────────────────────────────────────────────────

test("routeItemBySourceAxis5: a single passing candidate routes there unambiguously", () => {
  const r = routeItemBySourceAxis5({ candidateCategories: ["research"], expectedOutput: expectedOutputForRole("academic_research") });
  assert.equal(r.category, "research");
  assert.equal(r.ambiguous, false);
});

test("routeItemBySourceAxis5: the Journal of Commerce worked example — Regulatory and Market Intel both pass; source-expected probability tie-breaks to market", () => {
  // Framework Example 3: trade_press source, expected output Market Intel 70% / Regulatory 20% —
  // resolves the ambiguous "Regulatory Changes Across Transportation Sectors" item to Market Intel.
  const expected = { regulations: 0.2, market: 0.7, operations: 0.05, research: 0, out_of_scope: 0.05 };
  const r = routeItemBySourceAxis5({ candidateCategories: ["regulations", "market"], expectedOutput: expected });
  assert.equal(r.category, "market");
  assert.equal(r.ambiguous, true);
  assert.match(r.reason, /tie-broken/);
});

test("routeItemBySourceAxis5: zero candidates -> out_of_scope, reason names 'no rule passed'", () => {
  const r = routeItemBySourceAxis5({ candidateCategories: [], expectedOutput: expectedOutputForRole("vendor_corporate") });
  assert.equal(r.category, AXIS5_OUT_OF_SCOPE);
  assert.match(r.reason, /no rule passed under source-aware routing/);
});

test("routeItemBySourceAxis5: duplicate/out-of-vocab candidate categories are deduped/dropped, not crashed on", () => {
  const r = routeItemBySourceAxis5({ candidateCategories: ["market", "market", "not_a_real_category"], expectedOutput: null });
  assert.equal(r.category, "market");
  assert.equal(r.ambiguous, false);
});

test("routeItemBySourceAxis5: null expectedOutput never crashes — falls back to stable input order", () => {
  const r = routeItemBySourceAxis5({ candidateCategories: ["operations", "research"], expectedOutput: null });
  assert.equal(r.category, "operations"); // first in input order, since all scores are equally 0
  assert.equal(r.ambiguous, true);
});

test("routeItemBySourceAxis5: resolved category is anomaly-checked (Maersk-style vendor landing in a near-zero-expected bucket)", () => {
  const maersk = { regulations: 0, research: 0, market: 0.9, operations: 0, out_of_scope: 0.1 };
  const r = routeItemBySourceAxis5({ candidateCategories: ["regulations"], expectedOutput: maersk });
  assert.equal(r.category, "regulations");
  assert.equal(r.anomaly, true);
});

// ── 5c. isAnomalousCategory ──────────────────────────────────────────────────────────────────────

test("isAnomalousCategory: below the 5% default threshold -> true", () => {
  assert.equal(isAnomalousCategory("regulations", { regulations: 0.02, research: 0, market: 0.9, operations: 0, out_of_scope: 0.08 }), true);
});

test("isAnomalousCategory: at/above threshold -> false", () => {
  assert.equal(isAnomalousCategory("market", { regulations: 0, research: 0, market: 0.9, operations: 0, out_of_scope: 0.1 }), false);
});

test("isAnomalousCategory: custom threshold honored (framework open question 3: tighter/looser)", () => {
  const dist = { regulations: 0.08, research: 0, market: 0.9, operations: 0, out_of_scope: 0.02 };
  assert.equal(isAnomalousCategory("regulations", dist, 0.05), false);
  assert.equal(isAnomalousCategory("regulations", dist, 0.1), true);
});

test("isAnomalousCategory: no distribution to test against -> false (cannot assert anomaly, never guessed)", () => {
  assert.equal(isAnomalousCategory("regulations", null), false);
  assert.equal(isAnomalousCategory("regulations", undefined), false);
});

// ── 5b. detectDrift ──────────────────────────────────────────────────────────────────────────────

test("detectDrift: a >30pp single-category deviation flags drifted:true, deltas in percentage points", () => {
  const expected = { regulations: 0.5, research: 0.3, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const observed = { regulations: 0.1, research: 0.3, market: 0.5, operations: 0.05, out_of_scope: 0.05 };
  const r = detectDrift(observed, expected);
  assert.equal(r.drifted, true);
  assert.ok(Math.abs(r.deltas.regulations - 40) < 1e-9);
  assert.ok(Math.abs(r.deltas.market - 40) < 1e-9);
});

test("detectDrift: deviations all under threshold -> drifted:false", () => {
  const expected = { regulations: 0.5, research: 0.3, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  const observed = { regulations: 0.45, research: 0.35, market: 0.1, operations: 0.05, out_of_scope: 0.05 };
  assert.equal(detectDrift(observed, expected).drifted, false);
});

test("detectDrift: custom threshold honored (framework open question 2)", () => {
  const expected = { regulations: 0.5, research: 0.5, market: 0, operations: 0, out_of_scope: 0 };
  const observed = { regulations: 0.35, research: 0.65, market: 0, operations: 0, out_of_scope: 0 };
  assert.equal(detectDrift(observed, expected, 30).drifted, false); // 15pp < 30
  assert.equal(detectDrift(observed, expected, 10).drifted, true);  // 15pp > 10
});

test("detectDrift: missing observed or expected -> never drifted, deltas empty (nothing to compare yet)", () => {
  assert.deepEqual(detectDrift(null, { regulations: 1 }), { drifted: false, deltas: {} });
  assert.deepEqual(detectDrift({ regulations: 1 }, null), { drifted: false, deltas: {} });
});

// ── observedDistributionFromItems ────────────────────────────────────────────────────────────────

test("observedDistributionFromItems: buckets by surfaceOf(item_type, domain), sums to 1", () => {
  const items = [
    { item_type: "regulation", domain: null },       // -> regulations (item-type rule wins)
    { item_type: "market_signal", domain: null },     // -> market
    { item_type: "market_signal", domain: null },     // -> market
    { item_type: "unknown_type", domain: null },      // -> uncategorized -> out_of_scope bucket
  ];
  const d = observedDistributionFromItems(items);
  assert.ok(Math.abs(d.regulations - 0.25) < 1e-9);
  assert.ok(Math.abs(d.market - 0.5) < 1e-9);
  assert.ok(Math.abs(d.out_of_scope - 0.25) < 1e-9);
  const sum = AXIS5_CATEGORIES.reduce((s, c) => s + d[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("observedDistributionFromItems: empty input -> null (distinct from an all-zero distribution — nothing observed yet)", () => {
  assert.equal(observedDistributionFromItems([]), null);
  assert.equal(observedDistributionFromItems(undefined), null);
});

test("observedDistributionFromItems + detectDrift compose end-to-end against a source's expected_output", () => {
  const expected = expectedOutputForRole("vendor_corporate"); // market 0.9, out_of_scope 0.1
  const allRegulatory = Array.from({ length: 10 }, () => ({ item_type: "regulation", domain: null }));
  const observed = observedDistributionFromItems(allRegulatory);
  const drift = detectDrift(observed, expected);
  assert.equal(drift.drifted, true); // 100% regulations vs ~0% expected is a massive deviation
});
