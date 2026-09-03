// Unit test for the Wave W2 spend-gauge wire (unwired-module disposition register #2,
// docs/plans/unwired-disposition-2026-08-31.md §A): readSpendGauge/spend-gauge.mjs had zero
// production callers before this wave. Exercises the REAL exported response-body builder this
// route's GET handler calls (not a reimplementation), imported from its sibling logic.ts
// (BUILDGATE, 2026-09-02: route.ts may export only route handlers, so the builder was moved out
// of it — see logic.ts's header) — same sibling-logic-module pattern
// src/app/api/admin/sources/bulk-import/logic.ts's headReachabilityDecision and
// src/app/api/admin/recompute-trust/logic.ts's demotionOutcomeFor already use.
//
// What this proves: (1) every pre-existing field the uptime workflow's jq consumers read by name
// (healthy, reason, mtd_usd, monthly_ceiling_usd, pct, frozen, acquire_lock_on, freeze_since,
// latest_paid_at, paid_after_freeze, all_justified, paid_after_rows, month_start, checked_at)
// survives byte-for-byte regardless of the gauge, and (2) `spend_gauge` is genuinely ADDITIVE: it
// carries the real gauge shape when the read succeeded, and is `null` — never a missing key, never a
// thrown response — when it failed. Nothing here re-derives mtd_usd/pct/frozen from the gauge; they
// stay sourced from the health verdict exactly as before, by design (see route.ts's header comment).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { buildSpendResponseBody } = await jiti.import("./logic.ts");

// A minimal, representative computeSpendHealth() verdict (spend-health.mjs's own real return shape).
const HEALTHY_V = {
  healthy: true,
  reason: "frozen-and-quiet: MTD $0.00, ZERO paid rows since the freeze baseline 2026-08-13T17:00:00Z",
  mtdUsd: 0,
  pct: 0,
  frozen: false,
  acquireEnabled: false,
  latestPaidAt: null,
  paidAfterFreeze: 0,
  allJustified: false,
  paidAfterRows: [],
};

const CTX = {
  monthlyCeilingUsd: 130,
  freezeSinceIso: "2026-08-13T17:00:00Z",
  monthStartIso: "2026-09-01T00:00:00.000Z",
  checkedAtIso: "2026-09-01T12:00:00.000Z",
};

// The real computeGauge() return shape (spend-gauge.mjs).
const GAUGE = {
  month: { spentUsd: 4.5 },
  day: { spentUsd: 0.1 },
  item: null,
  trace: { paidRuns: 3, tracedPaidRuns: 3, untracedPaidRuns: 0, clean: true },
  header: "SPEND GAUGE — MTD $4.50 (actual, informational) · today $0.10 · paid-run 3/3 traced to a priced line",
};

test("every pre-existing field is present, named, and untouched by the gauge (contract preservation)", () => {
  const body = buildSpendResponseBody(HEALTHY_V, GAUGE, CTX);
  assert.equal(body.ok, true);
  assert.equal(body.healthy, true);
  assert.equal(body.reason, HEALTHY_V.reason);
  assert.equal(body.mtd_usd, 0, "mtd_usd must still come from the health verdict, not the gauge");
  assert.equal(body.monthly_ceiling_usd, 130);
  assert.equal(body.pct, 0);
  assert.equal(body.frozen, false);
  assert.equal(body.acquire_lock_on, false);
  assert.equal(body.freeze_since, "2026-08-13T17:00:00Z");
  assert.equal(body.latest_paid_at, null);
  assert.equal(body.paid_after_freeze, 0);
  assert.equal(body.all_justified, false);
  assert.deepEqual(body.paid_after_rows, []);
  assert.equal(body.month_start, CTX.monthStartIso);
  assert.equal(body.checked_at, CTX.checkedAtIso);
});

test("spend_gauge is ADDITIVE: carries the real gauge shape when the read succeeded", () => {
  const body = buildSpendResponseBody(HEALTHY_V, GAUGE, CTX);
  assert.deepEqual(body.spend_gauge, GAUGE);
  // mtd_usd (health-verdict trio) and spend_gauge.month.spentUsd (gauge) are DELIBERATELY independent
  // numbers from independent reads — proving the wire did NOT collapse them into one source.
  assert.equal(body.mtd_usd, 0);
  assert.equal(body.spend_gauge.month.spentUsd, 4.5);
});

test("spend_gauge is null (not a missing key, not a thrown response) when the gauge read failed", () => {
  const body = buildSpendResponseBody(HEALTHY_V, null, CTX);
  assert.equal("spend_gauge" in body, true, "key must still be present");
  assert.equal(body.spend_gauge, null);
  // Every other field is completely unaffected by the gauge failure.
  assert.equal(body.healthy, true);
  assert.equal(body.mtd_usd, 0);
});

test("an UNHEALTHY verdict's fields pass through unchanged alongside a populated gauge", () => {
  const redV = {
    ...HEALTHY_V,
    healthy: false,
    reason: "ANOMALY: 1 of 1 paid row(s) since the freeze do NOT trace to an operator-priced line",
    mtdUsd: 12.34,
    pct: 9.5,
    paidAfterFreeze: 1,
    paidAfterRows: [{ itemId: "item-9", sourceId: null, costUsd: 12.34, startedAt: "2026-09-01T01:00:00Z", justification: null }],
  };
  const body = buildSpendResponseBody(redV, GAUGE, CTX);
  assert.equal(body.healthy, false);
  assert.equal(body.mtd_usd, 12.34);
  assert.equal(body.paid_after_freeze, 1);
  assert.equal(body.paid_after_rows[0].item_id, "item-9");
  assert.equal(body.paid_after_rows[0].cost_usd, 12.34);
  // The gauge is still additive and unaffected by an unhealthy verdict.
  assert.deepEqual(body.spend_gauge, GAUGE);
});
