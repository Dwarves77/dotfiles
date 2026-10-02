// Unit tests for /api/workspace/assumptions's CRUD logic (lane W2-R2, 2026-10-01), mirroring
// workspace/bootstrap/logic.npmtest.mjs's pattern: import the REAL exported functions from logic.ts
// via jiti (not reimplementations), exercise them against a fake Supabase client, prove each
// behaviour (validation-before-write, org-scoping on update/delete, fail paths) independently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { listAssumptions, createAssumption, updateAssumption, deleteAssumption } =
  await jiti.import("./logic.ts");

const VALID_INPUT = {
  name: "Frankfurt-Milan express road linehaul stays diesel-costed through 2030",
  valueNumeric: 34,
  unit: "% of quoted margin",
  boundTo: "34% of quoted margin on EU road",
  loadBearing: true,
  vulnerable: true,
  reviewDate: "2026-12-01",
  sourceNote: "EU road tender Q4 renewal.",
};

const ROW = {
  id: "row-1",
  org_id: "org-1",
  name: VALID_INPUT.name,
  value_numeric: 34,
  unit: "% of quoted margin",
  bound_to: VALID_INPUT.boundTo,
  load_bearing: true,
  vulnerable: true,
  review_date: "2026-12-01",
  source_note: VALID_INPUT.sourceNote,
  status: "active",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

// ── listAssumptions ──

test("listAssumptions: org-scoped, bounded read, maps rows to the camelCase shape", async () => {
  const calls = [];
  const supabase = {
    from(table) {
      calls.push(table);
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          assert.equal(col, "org_id");
          assert.equal(val, "org-1");
          return chain;
        },
        order: () => chain,
        limit: async () => ({ data: [ROW], error: null }),
      };
      return chain;
    },
  };
  const result = await listAssumptions(supabase, "org-1");
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.assumptions.length, 1);
  assert.equal(result.body.assumptions[0].boundTo, VALID_INPUT.boundTo);
  assert.equal(result.body.assumptions[0].loadBearing, true);
  assert.deepEqual(calls, ["planning_assumption_register"]);
});

test("listAssumptions: a DB error fails soft to an empty list, never throws", async () => {
  const supabase = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: null, error: { message: "boom" } }),
      };
      return chain;
    },
  };
  const result = await listAssumptions(supabase, "org-1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.body.assumptions, []);
});

// ── createAssumption ──

test("createAssumption: rejects an invalid input BEFORE touching the database", async () => {
  let fromCalled = false;
  const supabase = { from: () => { fromCalled = true; return {}; } };
  const result = await createAssumption(supabase, "org-1", "user-1", { name: "" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.ok(Array.isArray(result.body.errors));
  assert.equal(fromCalled, false, "validation runs before any DB call");
});

test("createAssumption: inserts the mapped row with org_id and created_by stamped from the route's resolved identity, not the body", async () => {
  let insertedRow;
  const supabase = {
    from(table) {
      assert.equal(table, "planning_assumption_register");
      return {
        insert(row) {
          insertedRow = row;
          return {
            select: () => ({
              single: async () => ({ data: ROW, error: null }),
            }),
          };
        },
      };
    },
  };
  const result = await createAssumption(supabase, "org-1", "user-1", {
    ...VALID_INPUT,
    orgId: "org-attacker", // a client-supplied org_id must never win
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(insertedRow.org_id, "org-1");
  assert.equal(insertedRow.created_by, "user-1");
  assert.equal(result.body.assumption.name, VALID_INPUT.name);
});

test("createAssumption: a DB insert error is a 500, not a silent empty success", async () => {
  const supabase = {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "insert failed" } }) }) }),
    }),
  };
  const result = await createAssumption(supabase, "org-1", "user-1", VALID_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

// ── updateAssumption ──

test("updateAssumption: requires an id", async () => {
  const result = await updateAssumption({}, "org-1", undefined, VALID_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("updateAssumption: validates input before writing", async () => {
  const result = await updateAssumption({}, "org-1", "row-1", { ...VALID_INPUT, boundTo: "" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("updateAssumption: scopes the update to BOTH id and org_id (cross-org id guess is a 404, not a cross-tenant write)", async () => {
  const eqCalls = [];
  const supabase = {
    from: () => ({
      update: (row) => {
        assert.equal(row.bound_to, VALID_INPUT.boundTo);
        const chain = {
          eq: (col, val) => {
            eqCalls.push([col, val]);
            return chain;
          },
          select: () => chain,
          maybeSingle: async () => ({ data: ROW, error: null }),
        };
        return chain;
      },
    }),
  };
  const result = await updateAssumption(supabase, "org-1", "row-1", VALID_INPUT);
  assert.equal(result.ok, true);
  assert.deepEqual(eqCalls, [["id", "row-1"], ["org_id", "org-1"]]);
});

test("updateAssumption: no matching row (wrong org or id) is a 404", async () => {
  const supabase = {
    from: () => ({
      update: () => {
        const chain = { eq: () => chain, select: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
        return chain;
      },
    }),
  };
  const result = await updateAssumption(supabase, "org-1", "row-1", VALID_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

// ── deleteAssumption ──

test("deleteAssumption: requires an id", async () => {
  const result = await deleteAssumption({}, "org-1", undefined);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("deleteAssumption: scopes the delete to id AND org_id", async () => {
  const eqCalls = [];
  const supabase = {
    from: () => {
      const chain = {
        delete: () => chain,
        eq: (col, val) => {
          eqCalls.push([col, val]);
          return chain;
        },
        then: (fn) => Promise.resolve({ error: null }).then(fn),
      };
      return chain;
    },
  };
  const result = await deleteAssumption(supabase, "org-1", "row-1");
  assert.equal(result.ok, true);
  assert.deepEqual(eqCalls, [["id", "row-1"], ["org_id", "org-1"]]);
});

test("deleteAssumption: a DB error is a 500", async () => {
  const supabase = {
    from: () => {
      const chain = {
        delete: () => chain,
        eq: () => chain,
        then: (fn) => Promise.resolve({ error: { message: "delete failed" } }).then(fn),
      };
      return chain;
    },
  };
  const result = await deleteAssumption(supabase, "org-1", "row-1");
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});
