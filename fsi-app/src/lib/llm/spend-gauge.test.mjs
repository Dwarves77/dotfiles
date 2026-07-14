// @ts-check
// Red-then-green tests for the pure spend gauge (computeGauge) + hasPricedLineMarker. No I/O.
// Spend-control refactor 2026-07-13: the gauge carries NO limit — MTD/today/item are informational actuals,
// no "of $N" denominator, no pct-of-ceiling, no frozen/at-cap. Coverage is paid-run traceability to a line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGauge, hasPricedLineMarker } from "./spend-gauge.mjs";

test("gauge: reports MTD + today as informational actuals — NO denominator, NO pct-of-ceiling", () => {
  const g = computeGauge({ monthSpentUsd: 30, todaySpentUsd: 10 });
  assert.equal(g.month.spentUsd, 30);
  assert.equal(g.day.spentUsd, 10);
  assert.match(g.header, /MTD \$30\.00 \(actual, informational\)/);
  assert.match(g.header, /today \$10\.00/);
  // no limit framing may leak into the header
  assert.doesNotMatch(g.header, /\/\$/);       // no "of $N"
  assert.doesNotMatch(g.header, /%/);          // no pct
  assert.doesNotMatch(g.header, /FROZEN|AT CAP/);
});

test("gauge: a large MTD is still just information (never 'frozen', never a limit)", () => {
  const g = computeGauge({ monthSpentUsd: 175.25, todaySpentUsd: 12 });
  assert.equal(g.month.spentUsd, 175.25);
  assert.equal("frozen" in g.month, false);
  assert.equal("ceilingUsd" in g.month, false);
  assert.equal("pct" in g.month, false);
});

test("gauge: untraced paid runs surface a warning in the header", () => {
  const g = computeGauge({ monthSpentUsd: 40, todaySpentUsd: 5, paidRuns: 10, tracedPaidRuns: 3 });
  assert.equal(g.trace.untracedPaidRuns, 7);
  assert.equal(g.trace.clean, false);
  assert.match(g.header, /⚠ 7 UNTRACED/);
});

test("gauge: fully-traced paid runs are clean", () => {
  const g = computeGauge({ monthSpentUsd: 5, todaySpentUsd: 5, paidRuns: 4, tracedPaidRuns: 4 });
  assert.equal(g.trace.clean, true);
  assert.match(g.header, /4\/4 traced to a priced line/);
});

test("gauge: zero paid runs is clean (the quiet default)", () => {
  const g = computeGauge({ monthSpentUsd: 175.25, todaySpentUsd: 0, paidRuns: 0, tracedPaidRuns: 0 });
  assert.equal(g.trace.clean, true);
});

test("gauge: per-item spend reported (as information) only when supplied — no breaker/limit", () => {
  const none = computeGauge({ monthSpentUsd: 1, todaySpentUsd: 1 });
  assert.equal(none.item, null);
  const withItem = computeGauge({ monthSpentUsd: 1, todaySpentUsd: 1, itemSpentUsd: 3.5 });
  assert.equal(withItem.item?.spentUsd, 3.5);
  assert.equal("breakerUsd" in (withItem.item ?? {}), false);
  assert.equal("tripped" in (withItem.item ?? {}), false);
  assert.match(withItem.header, /item \$3\.50/);
});

test("hasPricedLineMarker: true only for a priced-line fetch_method or a truthy errors[].pricedLine", () => {
  assert.equal(hasPricedLineMarker({ errors: [{ telemetry: {} }] }), false);
  assert.equal(hasPricedLineMarker({ fetch_method: "priced-line", errors: [] }), true);
  assert.equal(hasPricedLineMarker({ errors: [{ pricedLine: "op-line-42" }] }), true);
  assert.equal(hasPricedLineMarker({ errors: [{ pricedLine: "" }] }), false);
  // a legacy acquire-justification is NOT a priced-line marker (the refactor tightens the requirement)
  assert.equal(hasPricedLineMarker({ errors: [{ justification: "missing_snapshot" }] }), false);
  assert.equal(hasPricedLineMarker({ errors: null }), false);
  assert.equal(hasPricedLineMarker(null), false);
});
