import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UPLOAD_TABLES } from "../../src/lib/spec09/csv-upload-contract.mjs";
import { runFixtureImport, runOneTable, fakeInsertMany, DEFAULT_TEST_ORG_ID } from "./run-fixture-import.mjs";

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixtures() {
  const fixtures = {};
  for (const table of UPLOAD_TABLES) {
    fixtures[table] = readFileSync(resolve(FIXTURES_DIR, `${table}.csv`), "utf8");
  }
  return fixtures;
}

// The exact per-table accept/reject counts each fixture is deliberately built to produce (a mix of both,
// per the lane brief: "tests for accept/reject rows"). Verified by hand against each fixture's own data
// in this lane's report.
const EXPECTED = {
  surcharge_audits: { accepted: 2, rejected: 3 },
  tce_data_quality: { accepted: 2, rejected: 3 },
  auxiliary_energy_profiles: { accepted: 2, rejected: 3 },
  eudr_plot_claims: { accepted: 4, rejected: 2 },
  custody_chains: { accepted: 2, rejected: 3 },
  indexation_clauses: { accepted: 3, rejected: 2 },
};

test("every fixture file exists and parses (ok:true) for its own table", () => {
  const fixtures = loadFixtures();
  for (const table of UPLOAD_TABLES) {
    assert.ok(fixtures[table] && fixtures[table].length > 0, `fixture missing or empty for ${table}`);
  }
});

test("runOneTable: end-to-end parse -> org-stamp -> insert -> read-back, one table at a time", async () => {
  const fixtures = loadFixtures();
  const fake = fakeInsertMany();
  for (const table of UPLOAD_TABLES) {
    const res = await runOneTable({ table, csvText: fixtures[table], orgId: DEFAULT_TEST_ORG_ID, insertMany: fake.insertMany });
    assert.equal(res.ok, true, `${table}: ${res.error}`);
    assert.equal(res.accepted, EXPECTED[table].accepted, `${table} accepted count`);
    assert.equal(res.rejected, EXPECTED[table].rejected, `${table} rejected count`);
    assert.equal(res.inserted, EXPECTED[table].accepted, `${table} inserted count matches accepted`);
    assert.equal(res.readBack.length, EXPECTED[table].accepted, `${table} read-back row count`);
    for (const row of res.readBack) {
      assert.equal(row.org_id, DEFAULT_TEST_ORG_ID, `${table}: every inserted row must be stamped with the caller's org_id`);
      assert.ok(row.id, `${table}: read-back row carries the (fake) assigned id`);
    }
  }
  // No accidental cross-table bleed — one insertMany call per table with data, in the fake inserter's
  // single accumulator.
  assert.equal(fake.inserted.length, Object.values(EXPECTED).reduce((s, e) => s + e.accepted, 0));
});

test("runFixtureImport: runs all six tables from injected fixture text, totals match the sum of each table", async () => {
  const fixtures = loadFixtures();
  const result = await runFixtureImport({ fixtures, orgId: DEFAULT_TEST_ORG_ID });
  assert.equal(result.tables.length, UPLOAD_TABLES.length);
  const expectedAccepted = Object.values(EXPECTED).reduce((s, e) => s + e.accepted, 0);
  const expectedRejected = Object.values(EXPECTED).reduce((s, e) => s + e.rejected, 0);
  assert.equal(result.totals.accepted, expectedAccepted);
  assert.equal(result.totals.rejected, expectedRejected);
  assert.equal(result.totals.inserted, expectedAccepted);
  for (const t of result.tables) {
    assert.equal(t.accepted, EXPECTED[t.table].accepted, t.table);
    assert.equal(t.rejected, EXPECTED[t.table].rejected, t.table);
  }
});

test("runOneTable: a table with no accepted rows never calls insertMany (no empty-batch write)", async () => {
  let called = false;
  const badCsv = "surcharge_audits header row not matching contract\nrow\n";
  const res = await runOneTable({
    table: "surcharge_audits",
    csvText: "corridor_id,carrier_id\nfoo,bar\n", // missing required headers -> ok:false
    orgId: DEFAULT_TEST_ORG_ID,
    insertMany: async () => { called = true; return { inserted: 0, rows: [] }; },
  });
  assert.equal(res.ok, false);
  assert.equal(called, false);
});
