// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSpendHealth } from "./spend-health.mjs";

const FREEZE = "2026-07-13T02:05:26Z";
const CEIL = 75;
const paid = (o) => ({ cost_usd_estimated: o.cost, started_at: o.at, fetch_method: "spend-call", intelligence_item_id: o.item ?? null, source_id: o.src ?? null, errors: [] });
const just = (o) => ({ cost_usd_estimated: 0, started_at: o.at, fetch_method: "acquire-justification", intelligence_item_id: o.item ?? null, source_id: o.src ?? null, errors: [{ justification: o.reason }] });

// ── STATE 1: frozen-and-quiet ──
test("frozen-and-quiet: MTD over the ceiling but no paid row after the freeze → HEALTHY (no permanent-red)", () => {
  const rows = [
    paid({ cost: 0.5468, at: "2026-07-13T01:50:09.876Z" }),
    paid({ cost: 0.3885, at: "2026-07-13T02:05:25.908Z" }), // last pre-freeze row (at/≤ baseline)
    paid({ cost: 74.31, at: "2026-07-05T00:00:00Z" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 0);
  assert.equal(v.frozen, true);
  assert.ok(v.pct >= 100);
  assert.equal(v.latestPaidAt, "2026-07-13T02:05:25.908Z");
});

// ── STATE 2: sanctioned-justified (lock ON + every post-freeze paid row pre-justified) ──
test("sanctioned window: paid rows after freeze, lock ON, all pre-justified → HEALTHY + enumerated", () => {
  const rows = [
    just({ at: "2026-08-02T10:00:00Z", item: "item-A", reason: "missing_snapshot" }),
    paid({ cost: 0.35, at: "2026-08-02T10:00:05Z", item: "item-A" }),
    paid({ cost: 0.12, at: "2026-08-02T10:00:09Z", item: "item-A" }), // 2nd spend call under the same justification
    just({ at: "2026-08-02T10:05:00Z", src: "src-B", reason: "content_changed" }),
    paid({ cost: 0.40, at: "2026-08-02T10:05:03Z", src: "src-B" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, true);
  assert.equal(v.paidAfterFreeze, 3);
  assert.equal(v.allJustified, true);
  assert.match(v.reason, /sanctioned window/);
  assert.deepEqual(v.paidAfterRows.map((r) => r.justification), ["missing_snapshot", "missing_snapshot", "content_changed"]);
});

// ── STATE 3: leak — lock OFF ──
test("leak: paid row after freeze while lock OFF → UNHEALTHY", () => {
  const rows = [paid({ cost: 0.12, at: "2026-07-13T14:00:00Z", item: "x" })];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterFreeze, 1);
  assert.match(v.reason, /LEAK/);
});

// ── STATE 4 (explicit): justified-but-lock-OFF is STILL a leak (the lock is the master gate) ──
test("justified-but-lock-OFF → UNHEALTHY (justification does not substitute for the lock)", () => {
  const rows = [
    just({ at: "2026-08-05T09:00:00Z", item: "item-C", reason: "cheap_verify_failed" }),
    paid({ cost: 0.30, at: "2026-08-05T09:00:04Z", item: "item-C" }),
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: false });
  assert.equal(v.healthy, false);
  assert.match(v.reason, /LEAK.*OFF/);
  // the row IS justified, but the lock was OFF → still a leak
  assert.equal(v.paidAfterRows[0].justification, "cheap_verify_failed");
});

// ── STATE 5: lock ON but a post-freeze paid row has NO pre-logged justification ──
test("lock ON but a paid row carries no pre-logged justification → UNHEALTHY", () => {
  const rows = [
    just({ at: "2026-08-06T09:00:00Z", item: "item-D", reason: "missing_snapshot" }),
    paid({ cost: 0.30, at: "2026-08-06T09:00:04Z", item: "item-D" }), // justified
    paid({ cost: 0.20, at: "2026-08-06T11:00:00Z", item: "item-E" }), // NO justification for item-E
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.allJustified, false);
  assert.match(v.reason, /NO pre-logged I2 justification/);
});

test("justification logged AFTER the paid call does not count (must be pre-logged)", () => {
  const rows = [
    paid({ cost: 0.30, at: "2026-08-07T09:00:00Z", item: "item-F" }),
    just({ at: "2026-08-07T09:05:00Z", item: "item-F", reason: "missing_snapshot" }), // logged AFTER
  ];
  const v = computeSpendHealth(rows, { freezeSinceIso: FREEZE, monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.equal(v.paidAfterRows[0].justification, null);
});

// ── edge cases (carried) ──
test("cost-0 rows (justification / step ledger) never count as paid activity", () => {
  const rows = [
    { cost_usd_estimated: 0, started_at: "2026-07-13T20:00:00Z", fetch_method: "canonical:ground" },
    { cost_usd_estimated: 0, started_at: "2026-07-14T09:00:00Z", fetch_method: "acquire-justification", errors: [{ justification: "missing_snapshot" }] },
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
  assert.equal(v.frozen, false);
});

test("unreadable freeze baseline → fail closed", () => {
  const rows = [paid({ cost: 0.5, at: "2026-07-13T01:00:00Z", item: "x" })];
  const v = computeSpendHealth(rows, { freezeSinceIso: "not-a-date", monthlyCeilingUsd: CEIL, acquireEnabled: true });
  assert.equal(v.healthy, false);
  assert.match(v.reason, /unreadable/);
});
