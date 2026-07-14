// @ts-check
// Red-then-green for the spend-watch verdict (spend-control refactor 2026-07-13). The alarm is priced-line
// TRACEABILITY, not %-of-ceiling: any post-freeze paid row that does not trace to an operator-priced line is an
// anomaly at any amount. Includes goldens (e) alarm on an untraceable paid row and (f) healthy when all trace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSpendHealth } from "./spend-health.mjs";

const FREEZE = "2026-07-13T02:05:26Z";
const CEIL = 130; // informational only in the refactor (never gates)
const paid = (o) => ({ cost_usd_estimated: o.cost, started_at: o.at, fetch_method: "spend-call", intelligence_item_id: o.item ?? null, source_id: o.src ?? null, errors: [] });
// an operator-priced-line marker row: cost 0, fetch_method='priced-line', errors[].pricedLine ref
const line = (o) => ({ cost_usd_estimated: 0, started_at: o.at, fetch_method: "priced-line", intelligence_item_id: o.item ?? null, source_id: o.src ?? null, errors: [{ pricedLine: o.ref }] });

// ── STATE 1: frozen-and-quiet ──
test("frozen-and-quiet: MTD high but no paid row after the freeze → HEALTHY (no permanent-red, no ceiling framing)", () => {
  const rows = [
    paid({ cost: 0.5468, at: "2026-07-13T01:50:09.876Z" }),
    paid({ cost: 0.3885, at: "2026-07-13T02:05:25.908Z" }), // last pre-freeze row (at/≤ baseline)
    paid({ cost: 174.31, at: "2026-07-05T00:00:00Z" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.latestPaidAt, "2026-07-13T02:05:25.908Z");
  assert.doesNotMatch(v.reason, /%|ceiling/); // ceiling-% framing removed from the verdict
});

// ── STATE 2 / golden (f): sanctioned-traced (lock ON + every post-freeze paid row traces to a priced line) ──
test("(f) sanctioned window: paid rows after freeze, lock ON, all trace to an operator-priced line → HEALTHY + enumerated", () => {
  const rows = [
    line({ at: "2026-08-02T10:00:00Z", item: "item-A", ref: "op-line-A" }),
    paid({ cost: 0.35, at: "2026-08-02T10:00:05Z", item: "item-A" }),
    paid({ cost: 0.12, at: "2026-08-02T10:00:09Z", item: "item-A" }), // 2nd spend call under the same priced line
    line({ at: "2026-08-02T10:05:00Z", src: "src-B", ref: "op-line-B" }),
    paid({ cost: 0.40, at: "2026-08-02T10:05:03Z", src: "src-B" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 3);
  assert.equal(v.allJustified, true);
  assert.match(v.reason, /sanctioned window/);
  assert.deepEqual(v.paidAfterRows.map((r) => r.justification), ["op-line-A", "op-line-A", "op-line-B"]);
});

// ── STATE 3 / golden (e): alarm on an untraceable paid row ──
test("(e) spend-watch ALARMS on an untraceable paid row (a paid row that does not trace to a priced line)", () => {
  const rows = [paid({ cost: 0.12, at: "2026-08-10T14:00:00Z", item: "x" })];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterFreeze, 1);
  assert.equal(v.paidAfterRows[0].justification, null);
  assert.match(v.reason, /ANOMALY[\s\S]*do NOT trace to an operator-priced line/);
});

// ── STATE 4: lock OFF is an anomaly even for a traced row (master arming gate did not authorize spend) ──
test("traced-but-lock-OFF → UNHEALTHY (the master arming gate is the go/no-go; nothing should have spent)", () => {
  const rows = [
    line({ at: "2026-08-05T09:00:00Z", item: "item-C", ref: "op-line-C" }),
    paid({ cost: 0.30, at: "2026-08-05T09:00:04Z", item: "item-C" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, false);
  assert.match(v.reason, /ANOMALY[\s\S]*OFF/);
  assert.equal(v.paidAfterRows[0].justification, "op-line-C"); // it IS traced, but the gate was OFF
});

// ── STATE 5: lock ON but one paid row has no pre-logged priced line ──
test("lock ON but a paid row has no pre-logged priced line → UNHEALTHY", () => {
  const rows = [
    line({ at: "2026-08-06T09:00:00Z", item: "item-D", ref: "op-line-D" }),
    paid({ cost: 0.30, at: "2026-08-06T09:00:04Z", item: "item-D" }), // traced
    paid({ cost: 0.20, at: "2026-08-06T11:00:00Z", item: "item-E" }), // NO priced line for item-E
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.allJustified, false);
  assert.match(v.reason, /do NOT trace to an operator-priced line/);
});

test("a priced line logged AFTER the paid call does not count (must be pre-logged)", () => {
  const rows = [
    paid({ cost: 0.30, at: "2026-08-07T09:00:00Z", item: "item-F" }),
    line({ at: "2026-08-07T09:05:00Z", item: "item-F", ref: "op-line-F" }), // logged AFTER
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterRows[0].justification, null);
});

test("a legacy acquire-justification marker no longer satisfies the alarm (priced-line marker required)", () => {
  const rows = [
    { cost_usd_estimated: 0, started_at: "2026-08-08T09:00:00Z", fetch_method: "acquire-justification", intelligence_item_id: "item-G", source_id: null, errors: [{ justification: "missing_snapshot" }] },
    paid({ cost: 0.30, at: "2026-08-08T09:00:05Z", item: "item-G" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterRows[0].justification, null); // the old justification does not trace
});

// ── edge cases (carried) ──
test("cost-0 rows (priced-line marker / step ledger) never count as paid activity", () => {
  const rows = [
    { cost_usd_estimated: 0, started_at: "2026-07-13T20:00:00Z", fetch_method: "canonical:ground" },
    { cost_usd_estimated: 0, started_at: "2026-07-14T09:00:00Z", fetch_method: "priced-line", errors: [{ pricedLine: "op-line-x" }] },
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.mtdUsd, 0);
});

test("empty month (next month, freeze still on) → HEALTHY frozen-and-quiet", () => {
  const v = computeSpendHealth([], { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
});

test("unreadable freeze baseline → fail closed", () => {
  const rows = [paid({ cost: 0.5, at: "2026-07-13T01:00:00Z", item: "x" })];
  const v = computeSpendHealth(rows, { freezeSinceIso: "not-a-date", monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.match(v.reason, /unreadable/);
});
