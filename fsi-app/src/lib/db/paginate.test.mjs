// Unit tests for the shared paginated-read helper (CAP-1000, 2026-09-05). No DB, no network — every
// case runs against a fake pageFactory/countQuery. Run: node --test fsi-app/src/lib/db/paginate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, assertBound, exactCount } from "./paginate.mjs";

test("fetchAllRows: walks every page until a short page, default pageSize 1000", async () => {
  const calls = [];
  const pageFactory = async (from, to) => {
    calls.push([from, to]);
    if (from === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: from + i })), error: null };
    if (from === 1000) return { data: Array.from({ length: 312 }, (_, i) => ({ id: from + i })), error: null };
    return { data: [], error: null };
  };
  const rows = await fetchAllRows(pageFactory);
  assert.equal(rows.length, 1312, "must return every row across pages, not the 1000-row cap");
  assert.deepEqual(calls, [[0, 999], [1000, 1999]], "must stop at the first short page — no extra page fetched");
});

test("fetchAllRows: a page exactly at pageSize forces one more round trip to confirm the end", async () => {
  const pageFactory = async (from) => {
    if (from === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null };
    return { data: [], error: null }; // the true end: exactly 1000 rows total
  };
  const rows = await fetchAllRows(pageFactory);
  assert.equal(rows.length, 1000);
});

test("fetchAllRows: an empty table returns []", async () => {
  const rows = await fetchAllRows(async () => ({ data: [], error: null }));
  assert.deepEqual(rows, []);
});

test("fetchAllRows: THROWS on any page error — never returns a partial result", async () => {
  const pageFactory = async (from) => {
    if (from === 0) return { data: [{ id: 1 }], error: null };
    return { data: null, error: { message: "statement timeout" } };
  };
  await assert.rejects(() => fetchAllRows(pageFactory, { pageSize: 1 }), /paginated read failed at offset 1.*statement timeout/);
});

test("fetchAllRows: a cap is enforced — a read exceeding it throws rather than silently ballooning", async () => {
  const pageFactory = async (from) => ({ data: Array.from({ length: 50 }, (_, i) => ({ id: from + i })), error: null });
  await assert.rejects(
    () => fetchAllRows(pageFactory, { pageSize: 50, cap: 100 }),
    /exceeded its cap of 100/
  );
});

test("fetchAllRows: respects a custom pageSize for the range width", async () => {
  const calls = [];
  const pageFactory = async (from, to) => {
    calls.push([from, to]);
    return from === 0 ? { data: Array.from({ length: 10 }, (_, i) => ({ id: i })), error: null } : { data: [], error: null };
  };
  await fetchAllRows(pageFactory, { pageSize: 10 });
  assert.deepEqual(calls[0], [0, 9]);
});

test("assertBound: passes when the read came in strictly under its bound", () => {
  assert.doesNotThrow(() => assertBound(41, 100, "sample"));
});

test("assertBound: throws when the read hit its bound exactly — the truncation signal", () => {
  assert.throws(() => assertBound(100, 100, "sample"), /likely TRUNCATED/);
});

test("exactCount: returns the DB-reported count, not a page length", async () => {
  const n = await exactCount(Promise.resolve({ count: 1316, error: null }));
  assert.equal(n, 1316);
});

test("exactCount: throws on a query error", async () => {
  await assert.rejects(
    () => exactCount(Promise.resolve({ count: null, error: { message: "relation does not exist" } })),
    /exact count failed.*relation does not exist/
  );
});

test("exactCount: throws when count is missing (query wasn't built with count:'exact')", async () => {
  await assert.rejects(
    () => exactCount(Promise.resolve({ count: null, error: null })),
    /was the query built with/
  );
});
