// Unit tests for the must-have / zero-legal surface-health semantics (R0.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MUST_HAVE_SURFACES,
  ZERO_LEGAL_SURFACES,
  ALL_SURFACES,
  evaluateSurface,
  overallOk,
  seedLeak,
} from "./surface-health.mjs";

test("surface roster matches the dispatch brief exactly", () => {
  assert.deepEqual(MUST_HAVE_SURFACES, [
    "dashboard",
    "regulations",
    "market",
    "research",
    "operations",
  ]);
  assert.deepEqual(ZERO_LEGAL_SURFACES, [
    "community",
    "map",
    "assistant-config",
    "onboarding-config",
  ]);
});

test("must-have surface with rows is ok", () => {
  assert.deepEqual(evaluateSurface("regulations", 97, null), {
    ok: true,
    backing_rows: 97,
    error: null,
  });
});

test("must-have surface with ZERO rows is NOT ok (silent-outage rule)", () => {
  const r = evaluateSurface("dashboard", 0, null);
  assert.equal(r.ok, false);
  assert.equal(r.backing_rows, 0);
  assert.match(r.error, /zero backing rows/);
});

test("zero-legal surface with zero rows IS ok (honest empty state)", () => {
  for (const name of ZERO_LEGAL_SURFACES) {
    const r = evaluateSurface(name, 0, null);
    assert.equal(r.ok, true, `${name} should be ok at zero rows`);
  }
});

test("any surface with a fetch error is NOT ok, even zero-legal", () => {
  const r = evaluateSurface("community", null, "relation does not exist");
  assert.equal(r.ok, false);
  assert.equal(r.error, "relation does not exist");
});

test("missing count without an error is NOT ok (never green on no data)", () => {
  const r = evaluateSurface("market", null, null);
  assert.equal(r.ok, false);
});

test("unknown surface name fails loudly", () => {
  const r = evaluateSurface("marketplace", 5, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown surface/);
});

test("overallOk requires every surface AND every rpc ok", () => {
  const green = Object.fromEntries(ALL_SURFACES.map((s) => [s, { ok: true }]));
  assert.equal(overallOk(green, { market_intel: { ok: true } }), true);
  assert.equal(
    overallOk({ ...green, regulations: { ok: false } }, { market_intel: { ok: true } }),
    false
  );
  assert.equal(overallOk(green, { market_intel: { ok: false } }), false);
  assert.equal(overallOk({}, {}), false, "empty surface set is not green");
});

test("seedLeak is false only when dashboard provably has rows", () => {
  assert.equal(seedLeak(283), false);
  assert.equal(seedLeak(0), true);
  assert.equal(seedLeak(null), true);
});
