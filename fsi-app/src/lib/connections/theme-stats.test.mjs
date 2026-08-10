// Tests for theme-stats.mjs (flywheel U3). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, parity by construction, same as U1/U2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeThemeStats, convergenceBand, CONVERGENCE_BANDS } from "./theme-stats.mjs";

const theme = (overrides = {}) => ({ surfaces: ["regulations"], convergence: 1, ...overrides });

test("computeThemeStats: totals, average convergence, cross/single-surface split", () => {
  const themes = [
    theme({ surfaces: ["regulations", "market"], convergence: 2 }),
    theme({ surfaces: ["regulations"], convergence: 1 }),
    theme({ surfaces: [], convergence: 0.5 }),
  ];
  const stats = computeThemeStats(themes);
  assert.equal(stats.total, 3);
  assert.equal(stats.avg_convergence, Number(((2 + 1 + 0.5) / 3).toFixed(6)));
  assert.equal(stats.cross_surface_count, 1);
  assert.equal(stats.single_surface_count, 1); // the zero-surface theme counts as neither
});

test("computeThemeStats: empty and degenerate inputs never throw, yield zeroed stats", () => {
  assert.deepEqual(computeThemeStats([]), { total: 0, avg_convergence: 0, cross_surface_count: 0, single_surface_count: 0 });
  assert.deepEqual(computeThemeStats(undefined), { total: 0, avg_convergence: 0, cross_surface_count: 0, single_surface_count: 0 });
  const stats = computeThemeStats([null, {}, { surfaces: "not-an-array", convergence: "NaN" }]);
  assert.equal(stats.total, 3);
  assert.equal(stats.avg_convergence, 0);
  assert.equal(stats.cross_surface_count, 0);
  assert.equal(stats.single_surface_count, 0);
});

test("convergenceBand: classifies at the documented thresholds, boundaries inclusive on the high side", () => {
  assert.equal(convergenceBand(CONVERGENCE_BANDS.high), "high");
  assert.equal(convergenceBand(CONVERGENCE_BANDS.high + 0.01), "high");
  assert.equal(convergenceBand(CONVERGENCE_BANDS.medium), "medium");
  assert.equal(convergenceBand(CONVERGENCE_BANDS.high - 0.01), "medium");
  assert.equal(convergenceBand(CONVERGENCE_BANDS.medium - 0.01), "low");
  assert.equal(convergenceBand(0), "low");
});

test("convergenceBand: degenerate input never throws, defaults to low", () => {
  assert.equal(convergenceBand(undefined), "low");
  assert.equal(convergenceBand(NaN), "low");
  assert.equal(convergenceBand("not a number"), "low");
});
