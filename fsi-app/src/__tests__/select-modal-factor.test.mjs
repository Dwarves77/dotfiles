// select-modal-factor.test.mjs — WO-24 (re-scoped 2026-08-30). Proves selectModalFactor's three-state
// contract against the ruling in select-modal-factor.mjs's own header. Written red-then-green: every
// test below was first run against a naive two-state stub ("pick a jurisdiction that has a factor, else
// pending") and failed on exactly the ambiguous-wins-over-partial-match case before the real
// implementation was written — see this session's Addendum in docs/ops/session-log.md for the record.
//
// Run standalone with:
//   node --test fsi-app/src/__tests__/select-modal-factor.test.mjs
// (covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectModalFactor } from "../lib/market/select-modal-factor.mjs";

// The two LIVE emission_factors rows, 2026-08-30 (source_key epa_egrid, tier modal_default,
// scope_kind modal, quantity_basis tonne_km) — used verbatim as the fixture so this proof exercises the
// real shape, not an invented one.
const ROAD_US = {
  factor_id: "f-road-us",
  tier: "modal_default",
  scope_kind: "modal",
  mode: "road",
  vehicle_class: "medium_heavy_duty_truck",
  jurisdiction: "US",
  quantity_basis: "tonne_km",
  ttw_co2e: 0.128411,
  source_key: "epa_egrid",
};
const RAIL_US = {
  factor_id: "f-rail-us",
  tier: "modal_default",
  scope_kind: "modal",
  mode: "rail",
  vehicle_class: "freight_rail_average",
  jurisdiction: "US",
  quantity_basis: "tonne_km",
  ttw_co2e: 0.014505,
  source_key: "epa_egrid",
};
const LIVE_FACTORS = [ROAD_US, RAIL_US];

test("single jurisdiction, mode given, matching factor -> resolved", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(result.state, "resolved");
  assert.equal(result.factor, ROAD_US);
});

test("single jurisdiction, mode given, matching rail factor -> resolved (proves it isn't hardcoded to road)", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "rail" });
  assert.equal(result.state, "resolved");
  assert.equal(result.factor, RAIL_US);
});

test("single jurisdiction, NO mode given, two candidate rows (US road+rail) -> no_factor, never a guess", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS });
  assert.equal(result.state, "no_factor");
  assert.equal(result.jurisdiction, "US");
  assert.equal(result.reason, "no_mode_basis");
});

test("single jurisdiction, no mode given, exactly ONE candidate row -> resolved (mode is moot)", () => {
  const result = selectModalFactor({ jurisdictionIso: ["SG"], factors: [{ ...ROAD_US, jurisdiction: "SG" }] });
  assert.equal(result.state, "resolved");
  assert.equal(result.factor.jurisdiction, "SG");
});

test("single jurisdiction with no factor row at all -> no_factor", () => {
  const result = selectModalFactor({ jurisdictionIso: ["SG"], factors: LIVE_FACTORS });
  assert.equal(result.state, "no_factor");
  assert.equal(result.jurisdiction, "SG");
  assert.equal(result.reason, "no_match");
});

test("multi-element jurisdiction array where NONE match a factor -> ambiguous", () => {
  const result = selectModalFactor({ jurisdictionIso: ["CN", "IR", "SG"], factors: LIVE_FACTORS });
  assert.equal(result.state, "ambiguous");
  assert.deepEqual(result.jurisdictions, ["CN", "IR", "SG"]);
});

test("THE load-bearing case: multi-element jurisdiction array where EXACTLY ONE element DOES match a factor -> still ambiguous, never resolved", () => {
  // ["CN","IR","SG","US"] — US alone has live factor rows. Picking US here would be fabricating a
  // corridor out of a jurisdiction list; the signal never named a single country.
  const result = selectModalFactor({
    jurisdictionIso: ["CN", "IR", "SG", "US"],
    factors: LIVE_FACTORS,
    mode: "road", // even WITH a mode that would resolve if jurisdiction were singular, still ambiguous
  });
  assert.equal(result.state, "ambiguous");
  assert.deepEqual(result.jurisdictions, ["CN", "IR", "SG", "US"]);
  assert.notEqual(result.state, "resolved");
  assert.equal(result.factor, undefined, "an ambiguous result must never carry a factor");
});

test("another real multi-country array (ES/FI/GB/NO/PT/SG) -> ambiguous, none of ES/FI/GB/NO/PT/SG have a factor", () => {
  const result = selectModalFactor({
    jurisdictionIso: ["ES", "FI", "GB", "NO", "PT", "SG"],
    factors: LIVE_FACTORS,
  });
  assert.equal(result.state, "ambiguous");
});

test("empty jurisdiction array -> no_factor, jurisdiction null, reason 'empty'", () => {
  const result = selectModalFactor({ jurisdictionIso: [], factors: LIVE_FACTORS });
  assert.equal(result.state, "no_factor");
  assert.equal(result.jurisdiction, null);
  assert.equal(result.reason, "empty");
});

test('["GLOBAL"] never resolves, even though a US factor exists — GLOBAL is not a jurisdiction', () => {
  const result = selectModalFactor({ jurisdictionIso: ["GLOBAL"], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(result.state, "no_factor");
  assert.equal(result.reason, "global");
});

test("case and whitespace robustness: '  us  ' (lowercase, padded) still matches 'US'", () => {
  const result = selectModalFactor({ jurisdictionIso: ["  us  "], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(result.state, "resolved");
  assert.equal(result.factor, ROAD_US);
});

test("case and whitespace robustness: '  global  ' (mixed case, padded) still treated as GLOBAL, not a jurisdiction", () => {
  const result = selectModalFactor({ jurisdictionIso: ["  Global  "], factors: LIVE_FACTORS });
  assert.equal(result.state, "no_factor");
  assert.equal(result.reason, "global");
});

test("mode matching is case/whitespace-robust too ('  ROAD  ' matches mode 'road')", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "  ROAD  " });
  assert.equal(result.state, "resolved");
  assert.equal(result.factor, ROAD_US);
});

test("a mode that matches nothing for that jurisdiction -> no_factor, not a fallback to another mode", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "ocean" });
  assert.equal(result.state, "no_factor");
  assert.equal(result.reason, "no_match");
});

test("non-array jurisdictionIso (null/undefined) degrades to no_factor, never throws", () => {
  assert.equal(selectModalFactor({ jurisdictionIso: null, factors: LIVE_FACTORS }).state, "no_factor");
  assert.equal(selectModalFactor({ jurisdictionIso: undefined, factors: LIVE_FACTORS }).state, "no_factor");
  assert.equal(selectModalFactor({}).state, "no_factor");
});

test("a single-element array holding an empty/blank string degrades to no_factor with jurisdiction null, not a crash", () => {
  const result = selectModalFactor({ jurisdictionIso: ["   "], factors: LIVE_FACTORS });
  assert.equal(result.state, "no_factor");
  assert.equal(result.jurisdiction, null);
  assert.equal(result.reason, "empty");
});

test("missing/undefined factors array degrades to no_factor, never throws", () => {
  const result = selectModalFactor({ jurisdictionIso: ["US"] });
  assert.equal(result.state, "no_factor");
});

test("a resolved result never mutates the input factor row", () => {
  const factor = { ...ROAD_US };
  const before = JSON.stringify(factor);
  selectModalFactor({ jurisdictionIso: ["US"], factors: [factor], mode: "road" });
  assert.equal(JSON.stringify(factor), before);
});
