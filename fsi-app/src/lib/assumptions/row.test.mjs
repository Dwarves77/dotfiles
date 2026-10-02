import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAssumptionRow, toInsertRow, toUpdateRow } from "./row.mjs";

const DB_ROW = {
  id: "row-1",
  org_id: "org-1",
  name: "Assumption name",
  value_numeric: 12.5,
  unit: "USD/tonne",
  bound_to: "corridor cost base",
  load_bearing: true,
  vulnerable: false,
  review_date: "2027-01-01",
  source_note: "cite",
  status: "active",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

test("mapAssumptionRow: snake_case DB row -> camelCase API shape", () => {
  const mapped = mapAssumptionRow(DB_ROW);
  assert.deepEqual(mapped, {
    id: "row-1",
    orgId: "org-1",
    name: "Assumption name",
    valueNumeric: 12.5,
    unit: "USD/tonne",
    boundTo: "corridor cost base",
    loadBearing: true,
    vulnerable: false,
    reviewDate: "2027-01-01",
    sourceNote: "cite",
    status: "active",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  });
});

test("mapAssumptionRow: null value_numeric/unit/source_note map to null, booleans coerced", () => {
  const mapped = mapAssumptionRow({ ...DB_ROW, value_numeric: null, unit: null, source_note: null, load_bearing: 0, vulnerable: 1 });
  assert.equal(mapped.valueNumeric, null);
  assert.equal(mapped.unit, null);
  assert.equal(mapped.sourceNote, null);
  assert.equal(mapped.loadBearing, false);
  assert.equal(mapped.vulnerable, true);
});

test("toInsertRow: stamps org_id/created_by from the route's resolved identity, maps camelCase -> snake_case", () => {
  const value = {
    name: "n",
    valueNumeric: 1,
    unit: "u",
    boundTo: "b",
    loadBearing: true,
    vulnerable: true,
    reviewDate: "2027-01-01",
    sourceNote: "s",
    status: "active",
  };
  const row = toInsertRow(value, { orgId: "org-1", createdBy: "user-1" });
  assert.deepEqual(row, {
    org_id: "org-1",
    name: "n",
    value_numeric: 1,
    unit: "u",
    bound_to: "b",
    load_bearing: true,
    vulnerable: true,
    review_date: "2027-01-01",
    source_note: "s",
    status: "active",
    created_by: "user-1",
  });
});

test("toUpdateRow: never carries org_id or created_by (PATCH cannot move ownership), stamps a fresh updated_at", () => {
  const value = {
    name: "n2",
    valueNumeric: null,
    unit: null,
    boundTo: "b2",
    loadBearing: false,
    vulnerable: false,
    reviewDate: "2027-02-01",
    sourceNote: null,
    status: "retired",
  };
  const row = toUpdateRow(value);
  assert.equal("org_id" in row, false);
  assert.equal("created_by" in row, false);
  assert.equal(row.name, "n2");
  assert.equal(row.status, "retired");
  assert.ok(typeof row.updated_at === "string" && row.updated_at.length > 0);
});
