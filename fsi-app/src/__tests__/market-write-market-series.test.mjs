// Proof for src/lib/market/write-market-series.mjs — the pure idempotent-upsert planning core (WO-16
// step 1: "idempotent upsert" keyed (series_key, reference_period)).
//
// LOCATION: same reasoning as the other new market tests in this directory — see
// contracts-market-series-migration.test.mjs's header. run-test-suite.sh has no glob over
// src/lib/market/**, so this proof lives in src/__tests__/ to be execution-wired without editing the
// suite list (outside this lane's write set).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planMarketSeriesUpsert, REFRESHABLE_FIELDS } from "../lib/market/write-market-series.mjs";

const row = (over = {}) => ({
  series_key: "eu-oil-bulletin:automotive-diesel",
  reference_period: "2026-08-24",
  label: "Automotive gas oil / diesel (EU average, before taxes)",
  value_numeric: 1493.60,
  unit: "EUR/1000L",
  currency: "EUR",
  derivation: "observed",
  origin_class: "official",
  source_key: "ec_weekly_oil_bulletin",
  source_ref: "Weekly Oil Bulletin, week of 2026-08-24",
  n_observations: 24,
  method_version: null,
  as_at_date: "2026-08-24",
  ...over,
});

test("a series_key+reference_period pair absent from existing rows is a CREATE", () => {
  const { toCreate, toUpdate } = planMarketSeriesUpsert([], [row()]);
  assert.equal(toCreate.length, 1);
  assert.equal(toUpdate.length, 0);
  assert.equal(toCreate[0].series_key, "eu-oil-bulletin:automotive-diesel");
});

test("a matching series_key+reference_period pair is an UPDATE, never a duplicate CREATE", () => {
  const existing = [{ id: "row-1", series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24" }];
  const { toCreate, toUpdate } = planMarketSeriesUpsert(existing, [row({ value_numeric: 1500.00 })]);
  assert.equal(toCreate.length, 0);
  assert.equal(toUpdate.length, 1);
  assert.equal(toUpdate[0].id, "row-1");
  assert.equal(toUpdate[0].patch.value_numeric, 1500.00);
});

test("re-running the SAME input against its own prior output plans zero creates (idempotency)", () => {
  const first = planMarketSeriesUpsert([], [row()]);
  assert.equal(first.toCreate.length, 1);
  // Simulate the row now existing (as it would after the first guarded insert).
  const existingAfterFirstRun = [{ id: "row-1", series_key: row().series_key, reference_period: row().reference_period }];
  const second = planMarketSeriesUpsert(existingAfterFirstRun, [row()]);
  assert.equal(second.toCreate.length, 0);
  assert.equal(second.toUpdate.length, 1, "same input against existing state is a refresh, not a no-op skip — a re-run must still keep the row current");
});

test("a DIFFERENT reference_period for the same series_key is a second, independent CREATE (the key is the pair, not just series_key)", () => {
  const existing = [{ id: "row-1", series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-17" }];
  const { toCreate, toUpdate } = planMarketSeriesUpsert(existing, [row({ reference_period: "2026-08-24" })]);
  assert.equal(toCreate.length, 1);
  assert.equal(toUpdate.length, 0);
});

test("a row with no reference_period is reported and skipped, never inserted as an ever-growing duplicate", () => {
  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert([], [row({ reference_period: null })]);
  assert.equal(toCreate.length, 0);
  assert.equal(toUpdate.length, 0);
  assert.equal(skippedNoReferencePeriod.length, 1);
});

test("UPDATE patch never touches series_key, reference_period or id (identity + key are immutable)", () => {
  const existing = [{ id: "row-1", series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24" }];
  const { toUpdate } = planMarketSeriesUpsert(existing, [row()]);
  assert.ok(!("series_key" in toUpdate[0].patch));
  assert.ok(!("reference_period" in toUpdate[0].patch));
  assert.ok(!("id" in toUpdate[0].patch));
});

test("UPDATE patch carries exactly REFRESHABLE_FIELDS, each present (nullable ones as null when absent)", () => {
  const existing = [{ id: "row-1", series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24" }];
  const { toUpdate } = planMarketSeriesUpsert(existing, [row()]);
  assert.deepEqual(Object.keys(toUpdate[0].patch).sort(), [...REFRESHABLE_FIELDS].sort());
});

test("multiple incoming rows are independently planned (mixed create + update in one call)", () => {
  const existing = [{ id: "row-1", series_key: "eu-oil-bulletin:eurosuper-95", reference_period: "2026-08-17" }];
  const incoming = [
    row({ series_key: "eu-oil-bulletin:eurosuper-95", reference_period: "2026-08-17" }), // update
    row({ series_key: "eu-oil-bulletin:eurosuper-95", reference_period: "2026-08-24" }), // create
  ];
  const { toCreate, toUpdate } = planMarketSeriesUpsert(existing, incoming);
  assert.equal(toCreate.length, 1);
  assert.equal(toUpdate.length, 1);
});
