// bls-oews-parser.npmtest.mjs — fixture-driven proof for the BLS OEWS series-ID builder + response
// parser. Runs under the fsi-app/src/**/*.npmtest.mjs glob (same wiring rationale as
// eurostat-nrg-pc-205-parser.npmtest.mjs). NETWORK-FREE: reads the committed fixture from disk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildOewsSeriesId, parseOewsResponse, OEWS_OCCUPATIONS } from "./bls-oews-parser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixtures", "bls-oews-sample.json"), "utf8"));

test("buildOewsSeriesId: 25-char fixed-width, dash-stripped, zero-padded", () => {
  const id = buildOewsSeriesId("53-3032");
  assert.equal(id, "OEUN000000000000053303213");
  assert.equal(id.length, 25);
});

test("buildOewsSeriesId: rejects a malformed SOC code rather than emitting a wrong-width ID", () => {
  assert.throws(() => buildOewsSeriesId("53-30"), /must be 6 digits/);   // too short
  assert.throws(() => buildOewsSeriesId("AB-1234"), /must be 6 digits/); // non-numeric
  // Dash is optional: the digits-only form of a valid code is accepted, not rejected.
  assert.equal(buildOewsSeriesId("533032"), buildOewsSeriesId("53-3032"));
});

test("OEWS_OCCUPATIONS catalog entries all build well-formed series IDs", () => {
  for (const o of OEWS_OCCUPATIONS) {
    const id = buildOewsSeriesId(o.socCode);
    assert.equal(id.length, 25);
    assert.match(id, /^OEUN0000000000000\d{8}$/);
  }
});

test("parseOewsResponse: one row per catalogued occupation, most recent usable year", () => {
  const obs = parseOewsResponse(fixture);
  const bySeries = new Map(obs.map((o) => [o.source_ref, o]));

  const drivers = bySeries.get("OEUN000000000000053303213");
  assert.ok(drivers);
  assert.equal(drivers.value_numeric, 54320); // 2024, newer than the 2023 row also present
  assert.equal(drivers.reference_period, "2024");
  assert.equal(drivers.fact_label, "US — Heavy and Tractor-Trailer Truck Drivers annual median wage (OEWS)");
});

test("parseOewsResponse: every row carries the full WO-17 envelope", () => {
  const obs = parseOewsResponse(fixture);
  const row = obs.find((o) => o.source_ref === "OEUN000000000000053706213");
  assert.equal(row.region_code, "US");
  assert.equal(row.dimension, "labor_markets");
  assert.equal(row.unit, "USD/year");
  assert.equal(row.currency, "USD");
  assert.equal(row.derivation, "observed");
  assert.equal(row.origin_class, "official");
  assert.equal(row.source_key, "bls");
  assert.equal(row.method_version, "bls-oews-parser@1");
  assert.equal(row.as_at_date, "2024-05-01");
  assert.equal(row.reference_period, "2024");
});

test("parseOewsResponse: a suppressed year is skipped in favour of the latest USABLE year", () => {
  const obs = parseOewsResponse(fixture);
  const supervisors = obs.find((o) => o.source_ref === "OEUN000000000000053104713");
  // 2023 value is "*" (suppressed); 2024 is the only usable year in the fixture.
  assert.ok(supervisors);
  assert.equal(supervisors.reference_period, "2024");
  assert.equal(supervisors.value_numeric, 63410);
});

test("parseOewsResponse: a series not in our occupation catalog is ignored, never guessed into a row", () => {
  const obs = parseOewsResponse(fixture);
  assert.equal(obs.some((o) => o.source_ref === "OEUN000000000000099999913"), false);
  assert.equal(obs.length, OEWS_OCCUPATIONS.length); // exactly one row per catalogued occupation
});

test("parseOewsResponse: a fully-suppressed series (no usable year at all) yields zero rows for it", () => {
  const allSuppressed = {
    status: "REQUEST_SUCCEEDED",
    Results: { series: [{ seriesID: buildOewsSeriesId("53-3032"), data: [{ year: "2024", period: "A01", value: "*" }] }] },
  };
  assert.deepEqual(parseOewsResponse(allSuppressed), []);
});

test("parseOewsResponse: throws on a non-succeeded API status rather than parsing garbage", () => {
  assert.throws(() => parseOewsResponse({ status: "REQUEST_NOT_PROCESSED", message: ["daily threshold exceeded"] }), /did not succeed/);
});

test("parseOewsResponse: throws on a malformed response shape", () => {
  assert.throws(() => parseOewsResponse({ status: "REQUEST_SUCCEEDED" }), /Results\.series/);
  assert.throws(() => parseOewsResponse(null), /response required/);
});
