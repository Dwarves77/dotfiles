// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSpendHealth } from "./spend-health.mjs";

const FREEZE = "2026-07-13T02:05:26Z";
const CEIL = 75;

test("frozen-and-quiet: MTD over the ceiling but no paid row after the freeze → HEALTHY (no permanent-red)", () => {
  const rows = [
    { cost_usd_estimated: 0.5468, started_at: "2026-07-13T01:50:09.876Z" },
    { cost_usd_estimated: 0.3885, started_at: "2026-07-13T02:05:25.908Z" }, // the last pre-freeze row
    { cost_usd_estimated: 74.31, started_at: "2026-07-05T00:00:00Z" },
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.frozen, true); // 75.2453 >= 75
  assert.ok(v.pct >= 100);
  assert.equal(v.latestPaidAt, "2026-07-13T02:05:25.908Z");
});

test("new paid row AFTER the freeze baseline → UNHEALTHY (leak / lock-OFF violation)", () => {
  const rows = [
    { cost_usd_estimated: 0.3885, started_at: "2026-07-13T02:05:25.908Z" },
    { cost_usd_estimated: 0.12, started_at: "2026-07-13T14:00:00Z" }, // NEW spend after freeze
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterFreeze, 1);
  assert.equal(v.latestPaidAt, "2026-07-13T14:00:00Z");
  assert.match(v.reason, /NEW SPEND/);
});

test("cost-0 rows (justification / step ledger) never count as paid activity", () => {
  const rows = [
    { cost_usd_estimated: 0, started_at: "2026-07-13T20:00:00Z" },
    { cost_usd_estimated: 0, started_at: "2026-07-14T09:00:00Z" },
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.latestPaidAt, null);
  assert.equal(v.mtdUsd, 0);
});

test("empty month (next month, freeze still on) → HEALTHY frozen-and-quiet", () => {
  const v = computeSpendHealth([], { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.frozen, false); // 0 < ceiling
  assert.equal(v.pct, 0);
});

test("unreadable freeze baseline → fail closed (paid rows counted as after, never masks a leak)", () => {
  const rows = [{ cost_usd_estimated: 0.5, started_at: "2026-07-13T01:00:00Z" }];
  const v = computeSpendHealth(rows, { freezeSinceIso: "not-a-date", monthlyCeilingUsd: CEIL });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterFreeze, 1);
  assert.match(v.reason, /unreadable/);
});
