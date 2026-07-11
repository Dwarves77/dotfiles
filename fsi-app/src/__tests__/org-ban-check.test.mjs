// Targeted test for the app-side org ban re-join block (Wave-α Track D d2).
// Exercises src/lib/orgs/ban-check.mjs checkOrgBan() — the decision the
// members-route add-by-email path relies on to return 403 for a banned account.
//
// Runs under `node --test` (the CI-real runner; covered by the
// fsi-app/src/__tests__/*.test.mjs glob in .discipline/run-test-suite.sh).
// A minimal chainable mock stands in for the service-role Supabase client so
// the decision is tested in isolation with no DB.

import test from "node:test";
import assert from "node:assert/strict";
import { checkOrgBan } from "../lib/orgs/ban-check.mjs";

// Build a mock that records the .eq() filters and returns a canned maybeSingle().
function mockService(maybeSingleResult, calls) {
  const builder = {
    _table: null,
    from(table) {
      builder._table = table;
      calls.table = table;
      return builder;
    },
    select() {
      return builder;
    },
    eq(col, val) {
      calls.filters.push([col, val]);
      return builder;
    },
    async maybeSingle() {
      return maybeSingleResult;
    },
  };
  return builder;
}

test("checkOrgBan: a ban row present -> banned (drives the 403)", async () => {
  const calls = { filters: [] };
  const service = mockService({ data: { user_id: "u-1" }, error: null }, calls);
  const result = await checkOrgBan(service, "org-1", "u-1");
  assert.deepEqual(result, { status: "banned" });
  // Confirms the lookup is scoped to BOTH org and user (org-scoped ban, not global).
  assert.equal(calls.table, "org_member_bans");
  assert.deepEqual(calls.filters, [
    ["org_id", "org-1"],
    ["user_id", "u-1"],
  ]);
});

test("checkOrgBan: no ban row -> ok (add proceeds)", async () => {
  const calls = { filters: [] };
  const service = mockService({ data: null, error: null }, calls);
  const result = await checkOrgBan(service, "org-1", "u-2");
  assert.deepEqual(result, { status: "ok" });
});

test("checkOrgBan: lookup error -> error (caller fails closed, never silently allows)", async () => {
  const calls = { filters: [] };
  const service = mockService(
    { data: null, error: { message: "boom" } },
    calls
  );
  const result = await checkOrgBan(service, "org-1", "u-3");
  assert.deepEqual(result, { status: "error", message: "boom" });
});
