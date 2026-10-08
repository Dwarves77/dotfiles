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

// ---- lane L4-E (2026-10-08, migration 373): the entity a producer's rows describe -------------------------------

import { entityIdFromEnv, PRODUCER_ENTITY_ID_ENV } from "../lib/market/write-market-series.mjs";
import { entityId as mintEntityId } from "../lib/entities/entity-id.mjs";

const EU = mintEntityId("jurisdiction", "EU");

test("entity: no entity configured leaves the plan exactly as before (creates and patches carry no entity_id)", () => {
  const existing = [{ id: "uuid-1", series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24", entity_id: null }];
  const { toCreate, toUpdate } = planMarketSeriesUpsert(existing, [row(), row({ reference_period: "2026-08-31" })], { entityId: null });
  assert.equal("entity_id" in toCreate[0], false);
  assert.equal("entity_id" in toUpdate[0].patch, false);
  assert.deepEqual(Object.keys(toUpdate[0].patch).sort(), [...REFRESHABLE_FIELDS].sort());
});

test("entity: a created row is stamped with the producer's entity unless the row already names one", () => {
  const { toCreate } = planMarketSeriesUpsert([], [row(), row({ reference_period: "2026-08-31", entity_id: mintEntityId("jurisdiction", "DE") })], { entityId: EU });
  assert.equal(toCreate[0].entity_id, EU);
  assert.equal(toCreate[1].entity_id, mintEntityId("jurisdiction", "DE"), "a row's own entity wins");
});

test("entity: an update patch carries it only when the existing row was read with a NULL entity_id; a set or unread value is never touched", () => {
  const key = { series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24" };
  const nullEntity = planMarketSeriesUpsert([{ id: "a", ...key, entity_id: null }], [row()], { entityId: EU });
  assert.equal(nullEntity.toUpdate[0].patch.entity_id, EU);
  const setEntity = planMarketSeriesUpsert([{ id: "b", ...key, entity_id: mintEntityId("jurisdiction", "US") }], [row()], { entityId: EU });
  assert.equal("entity_id" in setEntity.toUpdate[0].patch, false, "an existing entity is never overwritten");
  const unread = planMarketSeriesUpsert([{ id: "c", ...key }], [row()], { entityId: EU });
  assert.equal("entity_id" in unread.toUpdate[0].patch, false, "a producer that does not read the column never touches it");
});

test("entityIdFromEnv: unset or empty is null, a well-formed id passes, a malformed id fails loud; the default reads the process environment", () => {
  assert.equal(PRODUCER_ENTITY_ID_ENV, "PRODUCER_ENTITY_ID");
  assert.equal(entityIdFromEnv({}), null);
  assert.equal(entityIdFromEnv({ PRODUCER_ENTITY_ID: "" }), null);
  assert.equal(entityIdFromEnv({ PRODUCER_ENTITY_ID: EU }), EU);
  assert.throws(() => entityIdFromEnv({ PRODUCER_ENTITY_ID: "european-union" }), /not a well-formed entity id/);
  const prior = process.env.PRODUCER_ENTITY_ID;
  try {
    process.env.PRODUCER_ENTITY_ID = EU;
    assert.equal(planMarketSeriesUpsert([], [row()]).toCreate[0].entity_id, EU, "the planner's default is the environment, so no producer script changes");
    delete process.env.PRODUCER_ENTITY_ID;
    assert.equal("entity_id" in planMarketSeriesUpsert([], [row()]).toCreate[0], false);
  } finally {
    if (prior === undefined) delete process.env.PRODUCER_ENTITY_ID; else process.env.PRODUCER_ENTITY_ID = prior;
  }
});
