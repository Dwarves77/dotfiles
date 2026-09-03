// Run: node --test src/lib/market/carbon-cost-per-feu.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carbonCostPerFeu,
  GAP,
  UNCERTAINTY_PCT,
  CLASSIFICATIONS,
} from "./carbon-cost-per-feu.mjs";
import desnzFixture from "../../../scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json" with { type: "json" };
import epaFixture from "../../../scripts/gen/fixtures/emission-factors/epa-modal-defaults-2025.json" with { type: "json" };

const CORRIDOR = { origin: "CNSHA", dest: "NLRTM", mode: "ocean" };

// A synthetic road factor with a known, hand-checkable number (0.10163 kg/tonne-km, DESNZ "All HGVs").
const DESNZ_ALL_HGV = desnzFixture.rows.find((r) => r.vehicle_class === "hgv_all_diesel_average");

const GOOD_INPUT = Object.freeze({
  corridor: CORRIDOR,
  factor: DESNZ_ALL_HGV,
  distanceKm: 1000,
  distanceDerivation: "estimated",
  distanceBasis: "test fixture: illustrative 1000km routing distance",
  payloadTonnesPerFeu: 20,
  payloadDerivation: "estimated",
  payloadBasis: "test fixture: illustrative 20t payload assumption",
  carbonPrice: {
    value: 80,
    currency: "EUR",
    sourceKey: "eex-eua",
    asOf: "2026-08-30",
    derivation: "observed",
    basis: "test fixture: illustrative EUA clearing price",
  },
});

test("GAP: every gap is a distinct, stable string", () => {
  const values = Object.values(GAP);
  assert.equal(new Set(values).size, values.length);
});

test("CLASSIFICATIONS names exactly the three renderable classes", () => {
  assert.deepEqual(CLASSIFICATIONS, ["statutory", "derived", "estimate"]);
});

// ── gap reporting ────────────────────────────────────────────────────────────────────────────────────

test("no factor -> GAP.NO_FACTOR, and every other gap is still named alongside it", () => {
  const r = carbonCostPerFeu({ corridor: CORRIDOR });
  assert.equal(r.ok, false);
  assert.ok(r.gaps.includes(GAP.NO_FACTOR));
  assert.ok(r.gaps.includes(GAP.NO_DISTANCE));
  assert.ok(r.gaps.includes(GAP.NO_PAYLOAD));
  assert.ok(r.gaps.includes(GAP.NO_CARBON_PRICE));
  assert.equal(r.gaps.length, 4);
});

test("factor present but wrong quantity_basis -> NO_FACTOR gap carries carbonIntensity's own reason", () => {
  const r = carbonCostPerFeu({ ...GOOD_INPUT, factor: { ...DESNZ_ALL_HGV, quantity_basis: "vehicle_km" } });
  assert.equal(r.ok, false);
  const hit = r.gaps.find((g) => g.startsWith(GAP.NO_FACTOR));
  assert.ok(hit, "expected a NO_FACTOR-prefixed gap");
  assert.match(hit, /vehicle_km/);
});

test("only distance missing -> exactly one gap, factor/carbonPrice/payload still resolve into `partial`", () => {
  const r = carbonCostPerFeu({ ...GOOD_INPUT, distanceKm: null, distanceDerivation: undefined, distanceBasis: undefined });
  assert.equal(r.ok, false);
  assert.deepEqual(r.gaps, [GAP.NO_DISTANCE]);
  assert.ok(r.partial.intensity, "factor should still have resolved into partial.intensity");
  assert.equal(r.partial.payloadTonnesPerFeu, 20);
  assert.equal(r.partial.carbonPrice.value, 80);
});

test("only payload missing -> exactly one gap", () => {
  const r = carbonCostPerFeu({ ...GOOD_INPUT, payloadTonnesPerFeu: null, payloadDerivation: undefined, payloadBasis: undefined });
  assert.deepEqual(r.gaps, [GAP.NO_PAYLOAD]);
});

test("only carbon price missing (today's live state: eex-eua unimplemented) -> exactly one gap", () => {
  const r = carbonCostPerFeu({ ...GOOD_INPUT, carbonPrice: null });
  assert.deepEqual(r.gaps, [GAP.NO_CARBON_PRICE]);
});

// ── provenance is mandatory the moment a value is supplied ─────────────────────────────────────────────

test("a numeric distanceKm with no distanceDerivation throws — never an unlabelled number", () => {
  assert.throws(
    () => carbonCostPerFeu({ ...GOOD_INPUT, distanceDerivation: undefined }),
    /distanceDerivation must be one of/,
  );
});

test("a numeric distanceKm with an unrecognised derivation throws", () => {
  assert.throws(
    () => carbonCostPerFeu({ ...GOOD_INPUT, distanceDerivation: "guessed" }),
    /distanceDerivation must be one of/,
  );
});

test("a numeric payloadTonnesPerFeu with no payloadBasis throws", () => {
  assert.throws(
    () => carbonCostPerFeu({ ...GOOD_INPUT, payloadBasis: undefined }),
    /payloadTonnesPerFeu=.*payloadBasis citation/,
  );
});

test("carbonPrice with no currency throws", () => {
  assert.throws(
    () => carbonCostPerFeu({ ...GOOD_INPUT, carbonPrice: { ...GOOD_INPUT.carbonPrice, currency: undefined } }),
    /carbonPrice\.currency is required/,
  );
});

test("missing corridor throws (a programmer error, not a data gap)", () => {
  assert.throws(() => carbonCostPerFeu({ ...GOOD_INPUT, corridor: null }), /input\.corridor/);
});

// ── the computed number, hand-checked ───────────────────────────────────────────────────────────────

test("fully supplied inputs compute the hand-checked cost per FEU", () => {
  const r = carbonCostPerFeu(GOOD_INPUT);
  assert.equal(r.ok, true);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.unit, "FEU");
  assert.equal(r.currency, "EUR");
  // ttw_co2e = 0.10163 kg/tonne-km (DESNZ "All HGVs", published) -> carbonIntensity() converts to
  // gCO2e/tonne-km (x1000) then this module converts back to kg/tonne-km (/1000) — round-trips exactly.
  const kgPerTonneKm = 0.10163;
  const totalKgCo2e = kgPerTonneKm * 20 /* payload t */ * 1000 /* km */;
  const totalTonnesCo2e = totalKgCo2e / 1000;
  const expectedPoint = totalTonnesCo2e * 80 /* EUR/tCO2e */;
  assert.ok(Math.abs(r.point - expectedPoint) < 1e-9, `point ${r.point} should equal hand-checked ${expectedPoint}`);
});

test("low <= point <= high (an estimate never runs backwards)", () => {
  const r = carbonCostPerFeu(GOOD_INPUT);
  assert.ok(r.low <= r.point);
  assert.ok(r.point <= r.high);
});

test("distance and payload are both `estimated` -> low/high are exactly ±UNCERTAINTY_PCT compounded on point", () => {
  const r = carbonCostPerFeu(GOOD_INPUT);
  // Both distance and payload vary ±UNCERTAINTY_PCT (carbonPrice is 'observed', held fixed).
  const expectedLow = r.point * (1 - UNCERTAINTY_PCT) * (1 - UNCERTAINTY_PCT);
  const expectedHigh = r.point * (1 + UNCERTAINTY_PCT) * (1 + UNCERTAINTY_PCT);
  assert.ok(Math.abs(r.low - expectedLow) < 1e-6);
  assert.ok(Math.abs(r.high - expectedHigh) < 1e-6);
});

test("every input contractable but not statutory -> classification 'derived', and the band collapses (low === point === high)", () => {
  const r = carbonCostPerFeu({
    ...GOOD_INPUT,
    distanceDerivation: "observed",
    payloadDerivation: "calculated",
    carbonPrice: { ...GOOD_INPUT.carbonPrice, derivation: "observed" },
  });
  assert.equal(r.classification, "derived");
  assert.equal(r.low, r.point);
  assert.equal(r.point, r.high);
});

test("every input statutory -> classification 'statutory' (never happens live today, but the rule is generic)", () => {
  const statutoryFactor = { ...DESNZ_ALL_HGV, derivation: "statutory_fixed" };
  const r = carbonCostPerFeu({
    ...GOOD_INPUT,
    factor: statutoryFactor,
    distanceDerivation: "statutory_fixed",
    payloadDerivation: "statutory_formula",
    carbonPrice: { ...GOOD_INPUT.carbonPrice, derivation: "statutory_fixed" },
  });
  assert.equal(r.classification, "statutory");
  assert.equal(r.low, r.point);
  assert.equal(r.point, r.high);
});

test("classification is 'estimate' the moment even ONE input is modelled/estimated/interpolated (migration 286's weakest-link rule, reimplemented pure)", () => {
  const r = carbonCostPerFeu({
    ...GOOD_INPUT,
    distanceDerivation: "observed",
    payloadDerivation: "observed",
    carbonPrice: { ...GOOD_INPUT.carbonPrice, derivation: "modelled" }, // the one weak link
  });
  assert.equal(r.classification, "estimate");
  // Only carbonPrice (the modelled input) varies; distance/payload are observed, held fixed.
  assert.ok(r.low < r.point && r.point < r.high);
});

// ── proof against the REAL captured fixtures, not only synthetic numbers ───────────────────────────────

test("real DESNZ articulated-HGV row + real EPA rail row both compute without throwing, against the same corridor shape", () => {
  const desnzRow = desnzFixture.rows.find((r) => r.vehicle_class === "articulated_hgv_gt33t");
  const epaRow = epaFixture.rows.find((r) => r.vehicle_class === "freight_rail_average");
  assert.ok(desnzRow && epaRow);

  const r1 = carbonCostPerFeu({ ...GOOD_INPUT, factor: desnzRow, corridor: { origin: "GBFXT", dest: "NLRTM", mode: "road" } });
  assert.equal(r1.ok, true);
  assert.ok(r1.point > 0);

  const r2 = carbonCostPerFeu({ ...GOOD_INPUT, factor: epaRow, corridor: { origin: "USLAX", dest: "USNYC", mode: "rail" } });
  assert.equal(r2.ok, true);
  assert.ok(r2.point > 0);
  // EPA's row is 'calculated' (a derived unit conversion, not published as-is — see that fixture's own
  // header) so with every OTHER input 'observed' the overall classification still reads 'derived', never
  // 'statutory' — it is never allowed to borrow a stronger label than its weakest contributing input.
  const r3 = carbonCostPerFeu({
    ...GOOD_INPUT,
    factor: epaRow,
    corridor: { origin: "USLAX", dest: "USNYC", mode: "rail" },
    distanceDerivation: "observed",
    payloadDerivation: "observed",
    carbonPrice: { ...GOOD_INPUT.carbonPrice, derivation: "observed" },
  });
  assert.equal(epaRow.derivation, "calculated");
  assert.equal(r3.classification, "derived");
});

test("today's honest live state: the ADR-024 example corridor (CNSHA-NLRTM, ocean) has NO factor yet — every DESNZ ocean row is a needs_runner_fetch shell", () => {
  const oceanRows = desnzFixture.rows.filter((r) => r.mode === "ocean");
  assert.ok(oceanRows.length > 0);
  assert.ok(oceanRows.every((r) => r.needs_runner_fetch === true && r.ttw_co2e === null));
  const r = carbonCostPerFeu({ ...GOOD_INPUT, factor: oceanRows[0] });
  assert.equal(r.ok, false);
  assert.ok(r.gaps.some((g) => g.startsWith(GAP.NO_FACTOR)));
});
