// @ts-check
// Red-then-green tests for the pure spend gauge (computeGauge) + hasJustification. No I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGauge, hasJustification } from "./spend-gauge.mjs";

test("gauge: under budget reports pct and not frozen/atCap", () => {
  const g = computeGauge({ monthSpentUsd: 30, monthlyCeilingUsd: 75, todaySpentUsd: 10, dailyCapUsd: 25 });
  assert.equal(g.month.frozen, false);
  assert.equal(g.month.pct, 40);
  assert.equal(g.month.remainingUsd, 45);
  assert.equal(g.day.atCap, false);
  assert.equal(g.day.pct, 40);
  assert.match(g.header, /MTD \$30\.00\/\$75\.00 \(40%\)/);
});

test("gauge: at/over the monthly ceiling is FROZEN with 0 remaining", () => {
  const g = computeGauge({ monthSpentUsd: 75.25, monthlyCeilingUsd: 75, todaySpentUsd: 12, dailyCapUsd: 25 });
  assert.equal(g.month.frozen, true);
  assert.equal(g.month.remainingUsd, 0);
  assert.match(g.header, /FROZEN/);
});

test("gauge: at/over the daily cap reports AT CAP", () => {
  const g = computeGauge({ monthSpentUsd: 40, monthlyCeilingUsd: 75, todaySpentUsd: 25, dailyCapUsd: 25 });
  assert.equal(g.day.atCap, true);
  assert.match(g.header, /AT CAP/);
});

test("gauge: unjustified paid runs surface a warning in the header", () => {
  const g = computeGauge({ monthSpentUsd: 40, monthlyCeilingUsd: 75, todaySpentUsd: 5, dailyCapUsd: 25, paidRuns: 10, justifiedPaidRuns: 3 });
  assert.equal(g.justification.unjustifiedPaidRuns, 7);
  assert.equal(g.justification.clean, false);
  assert.match(g.header, /⚠ 7 UNJUSTIFIED/);
});

test("gauge: fully-justified paid runs are clean", () => {
  const g = computeGauge({ monthSpentUsd: 5, monthlyCeilingUsd: 75, todaySpentUsd: 5, dailyCapUsd: 25, paidRuns: 4, justifiedPaidRuns: 4 });
  assert.equal(g.justification.clean, true);
  assert.match(g.header, /4\/4 justified/);
});

test("gauge: zero paid runs is clean (the frozen-month default)", () => {
  const g = computeGauge({ monthSpentUsd: 75.25, monthlyCeilingUsd: 75, todaySpentUsd: 0, dailyCapUsd: 25, paidRuns: 0, justifiedPaidRuns: 0 });
  assert.equal(g.justification.clean, true);
});

test("gauge: item breaker reported only when item numbers supplied", () => {
  const none = computeGauge({ monthSpentUsd: 1, monthlyCeilingUsd: 75, todaySpentUsd: 1, dailyCapUsd: 25 });
  assert.equal(none.item, null);
  const tripped = computeGauge({ monthSpentUsd: 1, monthlyCeilingUsd: 75, todaySpentUsd: 1, dailyCapUsd: 25, itemSpentUsd: 3.5, perItemBreakerUsd: 3.5 });
  assert.equal(tripped.item?.tripped, true);
});

test("hasJustification: true only when an errors entry carries a truthy justification", () => {
  assert.equal(hasJustification([{ telemetry: {} }]), false);
  assert.equal(hasJustification([{ justification: "missing_snapshot" }]), true);
  assert.equal(hasJustification([{ justification: "" }]), false);
  assert.equal(hasJustification(null), false);
  assert.equal(hasJustification("nope"), false);
});
