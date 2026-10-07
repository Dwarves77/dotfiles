/** Tests for scripts/proof/schema-diff.mjs (lane PROOF-1). Fixture catalogs; names only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffCatalogs, readCatalog, summarizeDiff, CATALOG_QUERY, CATEGORIES } from "./schema-diff.mjs";

const A = {
  tables: ["items", "sources", "only_prod"],
  columns: ["items.id uuid", "items.title text", "sources.id uuid"],
  functions: ["f(a integer)", "g()"],
  triggers: ["items.t1"],
  constraints: ["items.items_pkey p", "sources.sources_pkey p"],
};
const B = {
  tables: ["items", "sources", "only_replay"],
  columns: ["items.id uuid", "items.title character varying", "sources.id uuid"],
  functions: ["f(a integer)"],
  triggers: ["items.t1", "items.t2"],
  constraints: ["items.items_pkey p", "sources.sources_pkey p"],
};

test("diffCatalogs counts and names what is only on each side, per category", () => {
  const d = diffCatalogs(A, B);
  assert.equal(d.categories.tables.only_in_a, 1);
  assert.deepEqual(d.categories.tables.names_only_in_a, ["only_prod"]);
  assert.deepEqual(d.categories.tables.names_only_in_b, ["only_replay"]);
  assert.equal(d.categories.functions.only_in_a, 1);
  assert.equal(d.categories.triggers.only_in_b, 1);
  assert.equal(d.categories.constraints.only_in_a + d.categories.constraints.only_in_b, 0);
  assert.equal(d.differing_total, 2 + 2 + 1 + 1 + 0);
});

test("a changed column type shows on both sides (a type difference is a differing column)", () => {
  const d = diffCatalogs(A, B);
  assert.deepEqual(d.categories.columns.names_only_in_a, ["items.title text"]);
  assert.deepEqual(d.categories.columns.names_only_in_b, ["items.title character varying"]);
});

test("identical catalogs differ by nothing", () => {
  assert.equal(diffCatalogs(A, A).differing_total, 0);
});

test("the output carries names and counts only: no keys beyond the declared categories, no row data", () => {
  const d = diffCatalogs(A, B);
  assert.deepEqual(Object.keys(d.categories), [...CATEGORIES]);
  for (const c of Object.values(d.categories)) assert.deepEqual(Object.keys(c).sort(), ["a_count", "b_count", "names_only_in_a", "names_only_in_b", "only_in_a", "only_in_b"]);
});

test("names are capped at 200 per list while the counts stay exact", () => {
  const big = { tables: Array.from({ length: 450 }, (_, i) => `t${i}`) };
  const d = diffCatalogs(big, {});
  assert.equal(d.categories.tables.only_in_a, 450);
  assert.equal(d.categories.tables.names_only_in_a.length, 200);
});

test("the catalog query is one read-only select over the public schema", () => {
  assert.match(CATALOG_QUERY, /^select json_build_object\(/);
  assert.ok(!/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(CATALOG_QUERY));
  assert.match(CATALOG_QUERY, /nspname = 'public'/);
});

test("readCatalog parses psql output and returns null on failure", () => {
  assert.deepEqual(readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: JSON.stringify(A) + "\n" }) }), A);
  assert.equal(readCatalog({ url: "x", spawn: () => ({ status: 1, stdout: "" }) }), null);
  assert.equal(readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: "not json" }) }), null);
});

test("summarizeDiff names each category with its counts", () => {
  const s = summarizeDiff(diffCatalogs(A, B));
  for (const cat of CATEGORIES) assert.match(s, new RegExp(`${cat}: proof`));
});
