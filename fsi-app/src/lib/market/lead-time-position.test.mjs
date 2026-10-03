// Proof for lead-time-position.mjs (lane L10, spec 02 section 6 item 5 plus section 7). Covers the
// not-forecastable floor, the unit gate, survivorship-adjacent exclusion (a row this module cannot
// read as months is dropped, never coerced), and the cohort-median computation, never a fabricated
// position under any sample size (CLAUDE.md rule 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_SAMPLE, isSbtiSeriesKey, buildLeadTimePosition } from "./lead-time-position.mjs";

function sbtiRow(i, months, overrides = {}) {
  return {
    series_key: `sbti:company-${i}`,
    label: `Company ${i}`,
    value_numeric: months,
    unit: "months",
    origin_class: "official",
    source_key: "sbti_target_dashboard",
    n_observations: 1,
    as_at_date: "2026-10-01",
    reference_period: "2026-10-01",
    ...overrides,
  };
}

test("isSbtiSeriesKey matches only the sbti: prefix", () => {
  assert.equal(isSbtiSeriesKey("sbti:company-1"), true);
  assert.equal(isSbtiSeriesKey("ecb-fx:eur-usd"), false);
  assert.equal(isSbtiSeriesKey(null), false);
  assert.equal(isSbtiSeriesKey(undefined), false);
});

test("zero rows -> not forecastable, honest reason, never throws", () => {
  const p = buildLeadTimePosition([]);
  assert.equal(p.forecastable, false);
  assert.equal(p.sampleSize, 0);
  assert.equal(p.minSample, DEFAULT_MIN_SAMPLE);
  assert.match(p.reason, /no SBTi-sourced lead-time rows/);
  assert.equal(p.cohortMedianMonths, null);
  assert.deepEqual(p.rows, []);
});

test("fewer than minSample usable rows -> not forecastable, never a fabricated position", () => {
  const rows = [sbtiRow(1, 10), sbtiRow(2, 20)];
  const p = buildLeadTimePosition(rows, { minSample: 5 });
  assert.equal(p.forecastable, false);
  assert.equal(p.sampleSize, 2);
  assert.match(p.reason, /only 2 usable SBTi row\(s\)/);
  assert.equal(p.cohortMedianMonths, null);
});

test("exactly minSample usable rows -> forecastable, cohort median computed", () => {
  const rows = [sbtiRow(1, 2), sbtiRow(2, 4), sbtiRow(3, 6), sbtiRow(4, 8), sbtiRow(5, 10)];
  const p = buildLeadTimePosition(rows, { minSample: 5 });
  assert.equal(p.forecastable, true);
  assert.equal(p.sampleSize, 5);
  assert.equal(p.reason, null);
  assert.equal(p.cohortMedianMonths, 6); // the middle of the sorted 5
  assert.equal(p.rows.length, 5);
  assert.deepEqual(p.rows.map((r) => r.months), [2, 4, 6, 8, 10]);
});

test("even-count cohort median averages the two middle values", () => {
  const rows = [sbtiRow(1, 1), sbtiRow(2, 3), sbtiRow(3, 5), sbtiRow(4, 7)];
  const p = buildLeadTimePosition(rows, { minSample: 4 });
  assert.equal(p.forecastable, true);
  assert.equal(p.cohortMedianMonths, 4); // (3+5)/2
});

test("non-sbti rows are excluded from the sample even when otherwise shaped identically", () => {
  const rows = [
    sbtiRow(1, 10),
    { ...sbtiRow(2, 20), series_key: "ecb-fx:eur-usd" },
  ];
  const p = buildLeadTimePosition(rows, { minSample: 1 });
  assert.equal(p.sampleSize, 1);
  assert.equal(p.rows[0].seriesKey, "sbti:company-1");
});

test("a row with unit !== 'months' is excluded, never coerced into a months value", () => {
  const rows = [sbtiRow(1, 10), sbtiRow(2, 20, { unit: "years" })];
  const p = buildLeadTimePosition(rows, { minSample: 1 });
  assert.equal(p.sampleSize, 1);
  assert.equal(p.rows[0].seriesKey, "sbti:company-1");
});

test("a non-numeric value_numeric is excluded, never throws", () => {
  const rows = [sbtiRow(1, 10), sbtiRow(2, "not-a-number")];
  const p = buildLeadTimePosition(rows, { minSample: 1 });
  assert.equal(p.sampleSize, 1);
});

test("default minSample is DEFAULT_MIN_SAMPLE (5) when not supplied", () => {
  const rows = [sbtiRow(1, 1), sbtiRow(2, 2), sbtiRow(3, 3), sbtiRow(4, 4)];
  const p = buildLeadTimePosition(rows);
  assert.equal(p.minSample, 5);
  assert.equal(p.forecastable, false);
});

test("provenance fields pass through per row (originClass, sourceKey, nObservations, dates)", () => {
  const rows = [sbtiRow(1, 10), sbtiRow(2, 20), sbtiRow(3, 30), sbtiRow(4, 40), sbtiRow(5, 50)];
  const p = buildLeadTimePosition(rows, { minSample: 5 });
  const row = p.rows[0];
  assert.equal(row.originClass, "official");
  assert.equal(row.sourceKey, "sbti_target_dashboard");
  assert.equal(row.nObservations, 1);
  assert.equal(row.asAtDate, "2026-10-01");
  assert.equal(row.referencePeriod, "2026-10-01");
});
