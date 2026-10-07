/** Tests for scripts/proof/schema-diff.mjs, the schema oracle gate (lane PROOF-1). Fixture catalogs; names only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCatalogs, readCatalog, summarizeDiff, CATALOG_QUERY, CATEGORIES } from "./schema-diff.mjs";

const CATALOG = {
  tables: { items: "t1", sources: "t2" },
  columns: { "items.id": "c1", "items.title": "c2", "sources.id": "c3" },
  constraints: { "items.items_pkey": "k1", "sources.sources_pkey": "k2" },
  indexes: { "items.items_pkey": "i1", "items.items_title_idx": "i2" },
  functions: { "f(a integer)": "f1", "g()": "f2" },
  triggers: { "items.t1": "g1" },
  policies: { "items.read": "p1" },
};
const clone = () => JSON.parse(JSON.stringify(CATALOG));

test("identical catalogs (the oracle dump equals the replay) are an empty diff", () => {
  const d = diffCatalogs(CATALOG, clone());
  assert.equal(d.identical, true);
  assert.equal(d.differing_total, 0);
  assert.match(summarizeDiff(d), /IDENTICAL/);
});

test("one differing column fails and the summary names it", () => {
  const oracle = clone();
  oracle.columns["items.title"] = "c2-changed-type";
  const d = diffCatalogs(CATALOG, oracle);
  assert.equal(d.identical, false);
  assert.equal(d.differing_total, 1);
  assert.deepEqual(d.categories.columns.names_changed, ["items.title"]);
  const text = summarizeDiff(d);
  assert.match(text, /FAILED, 1 differing object/);
  assert.match(text, /columns changed: items\.title/);
});

test("objects only on one side are named per category, on the right side", () => {
  const oracle = clone();
  delete oracle.functions["g()"];
  oracle.tables.only_prod = "t9";
  oracle.policies["items.write"] = "p2";
  oracle.triggers["items.t1"] = "different";
  oracle.indexes["items.extra_idx"] = "i9";
  oracle.constraints["items.items_pkey"] = "other";
  const d = diffCatalogs(CATALOG, oracle);
  assert.deepEqual(d.categories.functions.names_only_in_replayed, ["g()"]);
  assert.deepEqual(d.categories.tables.names_only_in_oracle, ["only_prod"]);
  assert.deepEqual(d.categories.policies.names_only_in_oracle, ["items.write"]);
  assert.deepEqual(d.categories.triggers.names_changed, ["items.t1"]);
  assert.deepEqual(d.categories.indexes.names_only_in_oracle, ["items.extra_idx"]);
  assert.deepEqual(d.categories.constraints.names_changed, ["items.items_pkey"]);
  assert.equal(d.differing_total, 6);
});

test("every ruled category is compared: tables, columns, constraints, indexes, functions, triggers, policies", () => {
  assert.deepEqual([...CATEGORIES], ["tables", "columns", "constraints", "indexes", "functions", "triggers", "policies"]);
  for (const cat of CATEGORIES) {
    const oracle = clone();
    oracle[cat].zz_extra = "x";
    assert.equal(diffCatalogs(CATALOG, oracle).differing_total, 1, cat);
  }
});

test("the report carries counts and names only: no definitions, no hashes, no row data", () => {
  const oracle = clone();
  oracle.columns["items.title"] = "c2-changed";
  const text = JSON.stringify(diffCatalogs(CATALOG, oracle));
  assert.ok(!text.includes("c2-changed") && !text.includes('"c1"'), "a definition hash leaked into the report");
  for (const c of Object.values(diffCatalogs(CATALOG, oracle).categories)) {
    assert.deepEqual(Object.keys(c).sort(), ["changed", "names_changed", "names_only_in_oracle", "names_only_in_replayed", "only_in_oracle", "only_in_replayed", "oracle_count", "replayed_count"]);
  }
});

test("names are capped at 200 per list in the report while the counts stay exact", () => {
  const big = { tables: Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`t${i}`, "x"])) };
  const d = diffCatalogs(big, {});
  assert.equal(d.categories.tables.only_in_replayed, 450);
  assert.equal(d.categories.tables.names_only_in_replayed.length, 200);
  assert.match(summarizeDiff(d), /and 410 more/);
});

test("the catalog query is one read-only select over the public schema, and hashes definitions", () => {
  assert.match(CATALOG_QUERY, /^select json_build_object\(/);
  assert.ok(!/\b(insert|update|delete|drop|alter|truncate)\b/i.test(CATALOG_QUERY.replace(/pg_get_\w+/g, "")));
  assert.match(CATALOG_QUERY, /nspname = 'public'/);
  assert.match(CATALOG_QUERY, /md5\(/);
  for (const needle of ["pg_get_functiondef", "pg_get_triggerdef", "pg_get_constraintdef", "pg_indexes", "pg_policies", "format_type", "pg_get_expr", "deptype = 'e'"]) {
    assert.ok(CATALOG_QUERY.includes(needle), needle);
  }
});

test("readCatalog parses psql output and returns null on failure", () => {
  assert.deepEqual(readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: JSON.stringify(CATALOG) + "\n" }) }), CATALOG);
  assert.equal(readCatalog({ url: "x", spawn: () => ({ status: 1, stdout: "" }) }), null);
  assert.equal(readCatalog({ url: "x", spawn: () => ({ status: 0, stdout: "not json" }) }), null);
});

test("ATTACK: the CLI refuses a non-loopback URL (exit 2) and needs all three arguments", () => {
  const script = fileURLToPath(new URL("./schema-diff.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "schema-diff-"));
  try {
    const bad = spawnSync(process.execPath, [script, "--replayed", "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", "--oracle", "postgresql://postgres:postgres@127.0.0.1:54322/oracle_check", "--out", join(dir, "o.json")], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /loopback/);
    assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
    assert.ok(readFileSync(script, "utf8").length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
