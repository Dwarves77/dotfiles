import { test } from "node:test";
import assert from "node:assert/strict";
import { METHODS } from "./index.ts";
import { computeMarketSeriesDelta, lifecycleFromOriginClasses, METHOD_ID, METHOD_VERSION } from "./market-series-delta.ts";

test("registers itself in METHODS at import time (via methods/index.ts's side-effect import)", () => {
  assert.ok(METHODS.has(METHOD_ID, METHOD_VERSION), "market_series_delta@1.0.0 should be registered");
  assert.equal(METHODS.get(METHOD_ID, METHOD_VERSION), computeMarketSeriesDelta);
});

const latestRow = {
  id: "ms-latest",
  series_key: "eia-v2:wti-crude-rwtc",
  reference_period: "2026-08-28",
  as_at_date: "2026-08-28",
  value_numeric: 63.5,
  unit: "$/BBL",
  currency: "USD",
  origin_class: "official",
};
const priorRow = {
  id: "ms-prior",
  series_key: "eia-v2:wti-crude-rwtc",
  reference_period: "2026-08-21",
  as_at_date: "2026-08-21",
  value_numeric: 61.0,
  unit: "$/BBL",
  currency: "USD",
  origin_class: "official",
};

function ctxFor(rows) {
  return {
    entityId: null,
    inputs: rows.map((r) => ({ table: "market_series", pk: r.id, version: null, row: r })),
    priorValue: null,
    now: new Date("2026-08-29T00:00:00Z"),
  };
}

test("computes a real 1-week delta from two resolved market_series observations, same series_key", async () => {
  const r = await computeMarketSeriesDelta(ctxFor([latestRow, priorRow]));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(Math.abs(r.value - 2.5) < 1e-9);
    assert.equal(r.unit, "$/BBL");
    assert.equal(r.currency, "USD");
    assert.equal(r.derivation, "calculated");
    assert.equal(r.originClass, "derived");
    assert.equal(r.lifecycle, "verified"); // both origin_class 'official'
    assert.equal(r.admissibility, "calculation_ok");
    assert.equal(r.halfLifeDays, null);
    assert.ok(r.confidence > 0 && r.confidence <= 1);
  }
});

test("lifecycle falls back to corroborated when either input's origin_class is not official/verified", async () => {
  const r = await computeMarketSeriesDelta(ctxFor([latestRow, { ...priorRow, origin_class: "community" }]));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.lifecycle, "corroborated");
});

test("lifecycleFromOriginClasses: verified only when EVERY class is official/verified", () => {
  assert.equal(lifecycleFromOriginClasses(["official", "official"]), "verified");
  assert.equal(lifecycleFromOriginClasses(["official", "verified"]), "verified");
  assert.equal(lifecycleFromOriginClasses(["official", "community"]), "corroborated");
  assert.equal(lifecycleFromOriginClasses([]), "corroborated");
});

test("refuses with a named reason when fewer than 2 inputs resolve (never fabricates a delta from one point)", async () => {
  const r = await computeMarketSeriesDelta(ctxFor([latestRow]));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /fewer than 2/);
});

test("refuses when an input row could not be resolved at all (null row)", async () => {
  const ctx = {
    entityId: null,
    inputs: [
      { table: "market_series", pk: "ms-latest", version: null, row: latestRow },
      { table: "market_series", pk: "missing", version: null, row: null },
    ],
    priorValue: null,
    now: new Date(),
  };
  const r = await computeMarketSeriesDelta(ctx);
  assert.equal(r.ok, false);
});

test("refuses when the two inputs span different series_keys (never compares across series)", async () => {
  const other = { ...priorRow, id: "ms-other", series_key: "eia-v2:brent-crude-rbrte" };
  const r = await computeMarketSeriesDelta(ctxFor([latestRow, other]));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /more than one series_key/);
});

test("refuses on a unit change between the two observations (never compares across a unit change)", async () => {
  const r = await computeMarketSeriesDelta(ctxFor([latestRow, { ...priorRow, unit: "EUR/1000L" }]));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /unit\/currency changed/);
});

test("refuses when only ONE observation resolves for the series (never fabricates a delta from one point, via computeSeriesDeltas)", async () => {
  const r = await computeMarketSeriesDelta(ctxFor([latestRow, latestRow]));
  // same row twice: computeSeriesDeltas dedupes by date, leaving a single point -> delta1w: null
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /no 1-week delta window/);
});
