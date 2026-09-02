// bls-oews-parser.npmtest.mjs — fixture-driven proof for the BLS OEWS series-ID builder + response
// parser. Runs under the fsi-app/src/**/*.npmtest.mjs glob (same wiring rationale as
// eurostat-nrg-pc-205-parser.npmtest.mjs). NETWORK-FREE: reads the committed fixture from disk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildOewsSeriesId,
  parseOewsResponse,
  OEWS_OCCUPATIONS,
  ANNUAL_MEDIAN_WAGE_DATATYPE,
  HOURLY_MEDIAN_WAGE_DATATYPE,
} from "./bls-oews-parser.mjs";

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

test("parseOewsResponse: one ANNUAL row per catalogued occupation, most recent usable year", () => {
  const obs = parseOewsResponse(fixture);
  const bySeries = new Map(obs.map((o) => [o.source_ref, o]));

  const drivers = bySeries.get("OEUN000000000000053303213");
  assert.ok(drivers);
  assert.equal(drivers.value_numeric, 54320); // 2024, newer than the 2023 row also present
  assert.equal(drivers.unit, "USD/year");
  assert.equal(drivers.reference_period, "2024");
  assert.equal(drivers.fact_label, "US — Heavy and Tractor-Trailer Truck Drivers annual median wage (OEWS)");
});

test("parseOewsResponse: one HOURLY row per occupation whose hourly series is present (datatype 08), independent of the annual row", () => {
  const obs = parseOewsResponse(fixture);
  const bySeries = new Map(obs.map((o) => [o.source_ref, o]));

  const driversHourly = bySeries.get("OEUN000000000000053303208");
  assert.ok(driversHourly, "hourly series must be its own row, not derived from the annual one");
  assert.equal(driversHourly.value_numeric, 26.15); // 2024 — NOT 54320/2080 (26.11...): independently sourced, never divided
  assert.equal(driversHourly.unit, "USD/hour");
  assert.equal(driversHourly.dimension, "labor_markets"); // same dimension as the annual row — same fact family
  assert.equal(driversHourly.reference_period, "2024");
  assert.equal(driversHourly.fact_label, "US — Heavy and Tractor-Trailer Truck Drivers hourly median wage (OEWS)");

  const freightHourly = bySeries.get("OEUN000000000000053706208");
  assert.ok(freightHourly);
  assert.equal(freightHourly.value_numeric, 17.95);
  assert.equal(freightHourly.unit, "USD/hour");
});

test("parseOewsResponse: every row carries the full WO-17 envelope, whichever measure it is", () => {
  const obs = parseOewsResponse(fixture);

  const annualRow = obs.find((o) => o.source_ref === "OEUN000000000000053706213");
  assert.equal(annualRow.region_code, "US");
  assert.equal(annualRow.dimension, "labor_markets");
  assert.equal(annualRow.unit, "USD/year");
  assert.equal(annualRow.currency, "USD");
  assert.equal(annualRow.derivation, "observed");
  assert.equal(annualRow.origin_class, "official");
  assert.equal(annualRow.source_key, "bls");
  assert.equal(annualRow.method_version, "bls-oews-parser@1");
  assert.equal(annualRow.as_at_date, "2024-05-01");
  assert.equal(annualRow.reference_period, "2024");

  const hourlyRow = obs.find((o) => o.source_ref === "OEUN000000000000053706208");
  assert.equal(hourlyRow.region_code, "US");
  assert.equal(hourlyRow.dimension, "labor_markets");
  assert.equal(hourlyRow.unit, "USD/hour");
  assert.equal(hourlyRow.currency, "USD");
  assert.equal(hourlyRow.derivation, "observed");
  assert.equal(hourlyRow.origin_class, "official");
  assert.equal(hourlyRow.source_key, "bls");
  assert.equal(hourlyRow.method_version, "bls-oews-parser@1");
  assert.equal(hourlyRow.as_at_date, "2024-05-01");
  assert.equal(hourlyRow.reference_period, "2024");
});

test("parseOewsResponse: a suppressed year is skipped in favour of the latest USABLE year", () => {
  const obs = parseOewsResponse(fixture);
  const supervisors = obs.find((o) => o.source_ref === "OEUN000000000000053104713");
  // 2023 value is "*" (suppressed); 2024 is the only usable year in the fixture.
  assert.ok(supervisors);
  assert.equal(supervisors.reference_period, "2024");
  assert.equal(supervisors.value_numeric, 63410);
});

test("parseOewsResponse: an occupation with an annual series but NO hourly series in the response yields ONLY the annual row — an honest per-measure gap, never a fabricated hourly figure", () => {
  const obs = parseOewsResponse(fixture);
  // Supervisors (53-1047): fixture carries a datatype-13 (annual) series but no datatype-08 (hourly) series at all.
  const supervisorRows = obs.filter((o) => o.source_ref.startsWith("OEUN000000000000053104"));
  assert.equal(supervisorRows.length, 1, "exactly the annual row, no hourly row conjured for it");
  assert.equal(supervisorRows[0].unit, "USD/year");
  assert.equal(obs.some((o) => o.source_ref === "OEUN000000000000053104708"), false);
});

test("parseOewsResponse: a series not in our occupation catalog is ignored, never guessed into a row", () => {
  const obs = parseOewsResponse(fixture);
  assert.equal(obs.some((o) => o.source_ref === "OEUN000000000000099999913"), false);
  // 2 occupations (drivers, freight movers) with BOTH measures + 1 occupation (supervisors) with annual only.
  assert.equal(obs.length, OEWS_OCCUPATIONS.length + 2);
});

test("buildOewsSeriesId with HOURLY_MEDIAN_WAGE_DATATYPE builds the datatype-08 series ID, distinct from the default annual one", () => {
  const annualId = buildOewsSeriesId("53-3032", ANNUAL_MEDIAN_WAGE_DATATYPE);
  const hourlyId = buildOewsSeriesId("53-3032", HOURLY_MEDIAN_WAGE_DATATYPE);
  assert.equal(annualId, "OEUN000000000000053303213");
  assert.equal(hourlyId, "OEUN000000000000053303208");
  assert.notEqual(annualId, hourlyId);
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
