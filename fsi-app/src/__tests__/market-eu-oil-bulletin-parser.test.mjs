// Fixture-tested proof for src/lib/market/parsers/eu-weekly-oil-bulletin.mjs (WO-16 step 3).
//
// LOCATION: same reasoning as contracts-provenance-envelope.test.mjs and
// contracts-market-series-migration.test.mjs — fsi-app/.discipline/run-test-suite.sh (the canonical
// suite) globs `fsi-app/src/__tests__/*.test.mjs` but has no glob covering `src/lib/market/**`, so a
// co-located `src/lib/market/parsers/eu-weekly-oil-bulletin.test.mjs` would be a green test run by
// nothing (CLAUDE.md standing rule 15). Placed here so it is actually execution-wired without editing
// run-test-suite.sh, which is outside this lane's write set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEuWeeklyOilBulletinCsv, PRODUCTS } from "../lib/market/parsers/eu-weekly-oil-bulletin.mjs";
import { SAMPLE_BULLETIN_CSV, SAMPLE_BULLETIN_CSV_WITH_ERRORS } from "./market-eu-oil-bulletin-parser.fixtures.mjs";

test("parses every row of the two-week fixture (6 products x 2 weeks = 12 rows), zero warnings", () => {
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  assert.equal(rows.length, 12);
  assert.deepEqual(warnings, []);
});

test("every parsed row carries the full envelope + origin_class (WO-16: from day one, no exceptions)", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  for (const r of rows) {
    assert.equal(r.derivation, "observed");
    assert.equal(r.origin_class, "official");
    assert.equal(r.currency, "EUR");
    assert.ok(r.source_key, `row ${r.series_key} is missing source_key`);
    assert.ok(r.source_ref, `row ${r.series_key} is missing source_ref`);
    assert.ok(r.as_at_date, `row ${r.series_key} is missing as_at_date`);
    assert.ok(r.reference_period, `row ${r.series_key} is missing reference_period`);
    assert.equal(typeof r.value_numeric, "number");
    assert.ok(Number.isFinite(r.value_numeric) && r.value_numeric > 0);
  }
});

test("series_key is namespaced eu-oil-bulletin:<product> and matches the market_series format CHECK", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  const FORMAT_RE = /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/; // mirrors migration 268's market_series_series_key_format_check
  for (const r of rows) {
    assert.match(r.series_key, /^eu-oil-bulletin:/);
    assert.match(r.series_key, FORMAT_RE);
  }
});

test("unit follows the product's own dual-unit convention (EUR/1000L for auto fuels, EUR/tonne for heavy grades)", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  assert.equal(byKey.get("eu-oil-bulletin:automotive-diesel").unit, "EUR/1000L");
  assert.equal(byKey.get("eu-oil-bulletin:eurosuper-95").unit, "EUR/1000L");
  assert.equal(byKey.get("eu-oil-bulletin:heavy-fuel-oil-3-5pct").unit, "EUR/tonne");
  assert.equal(byKey.get("eu-oil-bulletin:residual-fuel-oil-1pct").unit, "EUR/tonne");
});

test("n_observations carries n_member_states as the envelope's sample-size field", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  const diesel = rows.find((r) => r.series_key === "eu-oil-bulletin:automotive-diesel" && r.reference_period === "2026-08-17");
  assert.equal(diesel.n_observations, 24);
});

test("reference_period and as_at_date both equal the row's week_ending (weekly point observation, not a calculated period)", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV);
  for (const r of rows) assert.equal(r.reference_period, r.as_at_date);
});

// ── error handling: every bad row is a warning + skip, never a throw, never a fabricated field ──────

test("malformed rows produce warnings and are skipped; well-formed rows in the same input still parse", () => {
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV_WITH_ERRORS);
  // Row 1 (eurosuper-95) is fully well-formed; row 5 (lpg-motor-fuel, bad n_member_states) still
  // parses with n_observations degraded to NULL (a warning, not a skip — see the dedicated test below).
  // Rows 2/3/4/6 are skipped (bad week_ending / unrecognised product / bad price_eur x2).
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.series_key), ["eu-oil-bulletin:eurosuper-95", "eu-oil-bulletin:lpg-motor-fuel"]);
  assert.equal(warnings.length, 5, `expected 5 warnings, got: ${JSON.stringify(warnings)}`);
});

test("bad week_ending is a warning, never coerced into a guessed date", () => {
  const { warnings } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV_WITH_ERRORS);
  assert.ok(warnings.some((w) => /bad week_ending/.test(w)));
});

test("an unrecognised product is a warning, never assigned a guessed unit", () => {
  const { warnings } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV_WITH_ERRORS);
  assert.ok(warnings.some((w) => /unrecognised product "unknown-product"/.test(w)));
});

test("a non-numeric or non-positive price is a warning, never stored as zero/NaN", () => {
  const { warnings } = parseEuWeeklyOilBulletinCsv(SAMPLE_BULLETIN_CSV_WITH_ERRORS);
  assert.ok(warnings.some((w) => /bad price_eur "not-a-number"/.test(w)));
  assert.ok(warnings.some((w) => /bad price_eur "-5.00"/.test(w)));
});

test("a non-numeric n_member_states degrades to NULL n_observations with a warning, row still parses", () => {
  const csv = `week_ending;product;price_eur;n_member_states
2026-08-24;lpg-motor-fuel;709.15;not-a-count`;
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].n_observations, null);
  assert.ok(warnings.some((w) => /bad n_member_states/.test(w)));
});

test("empty input produces no rows and one explanatory warning, never throws", () => {
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv("");
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
});

test("a header missing a required column is reported, not silently misaligned", () => {
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv("product;price_eur\nautomotive-diesel;1500");
  assert.equal(rows.length, 0);
  assert.ok(warnings[0].includes("header missing required column"));
});

test("PRODUCTS is the closed, documented vocabulary the parser recognises (6 entries)", () => {
  assert.equal(Object.keys(PRODUCTS).length, 6);
  for (const [slug, def] of Object.entries(PRODUCTS)) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(def.label && def.unit);
  }
});
