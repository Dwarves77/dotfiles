// migration-history-objects.test.mjs: proof of the outside-ledger object check (lane MIG-HIST-2). No npm imports.
// Pattern: a clean fixture verifies (green); each failure class is planted as an attack and must be named (red);
// the real tree's ten outside-ledger files are run against a catalog replayed from the tree itself, then attacked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { MIG_DIR, MAP_PATH, fileEntries } from "../migrations/build-applied-map.mjs";
import {
  extractObjects, extractEnds, endedBy, verifyOutsideLedger, emptyCatalog, catalogFromRows, liveCatalog, CATALOG_SQL,
} from "./migration-history-objects.mjs";

const kinds = (sql) => extractObjects(sql).map((o) => `${o.kind}:${o.table ? `${o.table}.` : ""}${o.name}`);

test("extractObjects: statement heads for table, view, function, index, policy, column, constraint", () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.t1 (id int);
    CREATE OR REPLACE VIEW v1 AS SELECT 1;
    CREATE MATERIALIZED VIEW mv1 AS SELECT 1;
    CREATE OR REPLACE FUNCTION public.f1(a int) RETURNS int LANGUAGE sql AS $$ CREATE TABLE inside_body (x int); $$;
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix1 ON public.t1 (id);
    CREATE POLICY "p one" ON t1 FOR SELECT USING (true);
    ALTER TABLE public.t1 ADD COLUMN IF NOT EXISTS c1 text, ADD COLUMN c2 int DEFAULT (1), ADD CONSTRAINT k1 CHECK (c2 > 0);
    ALTER TABLE t1 ENABLE ROW LEVEL SECURITY;
    -- CREATE TABLE in_a_comment (x int);`;
  assert.deepEqual(kinds(sql), ["table:t1", "view:v1", "view:mv1", "function:f1", "index:t1.ix1", "policy:t1.p one", "column:t1.c1", "column:t1.c2", "constraint:t1.k1"]);
});

test("extractObjects never reads a dollar-quoted body or a comment as an object", () => {
  assert.deepEqual(kinds("DO $$ BEGIN CREATE TABLE hidden (x int); END $$;"), []);
  assert.deepEqual(kinds("/* CREATE TABLE c (x int); */ SELECT 1;"), []);
});

test("extractEnds: drops, renames away, and dropped columns", () => {
  const ends = extractEnds(`
    DROP TABLE IF EXISTS public.a, b;
    DROP FUNCTION IF EXISTS public.f(uuid, integer);
    DROP POLICY IF EXISTS "p" ON t;
    ALTER TABLE t DROP COLUMN IF EXISTS c;
    ALTER TABLE t RENAME COLUMN c2 TO c3;
    ALTER POLICY q ON t RENAME TO q2;`).map((e) => `${e.kind}:${e.table ? `${e.table}.` : ""}${e.name}${e.rename ? ":rename" : ""}`);
  assert.deepEqual(ends, ["table:a", "table:b", "function:f", "policy:t.p", "column:t.c", "column:t.c2:rename", "policy:t.q:rename"]);
});

test("endedBy: last event wins; a dropped table ends its columns; a re-create makes it live again; earlier files never end an object", () => {
  const files = new Map([
    ["010_make.sql", "CREATE TABLE t (id int);\nALTER TABLE t ADD COLUMN c int;\nCREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;"],
    ["005_before.sql", "DROP TABLE t;"],
    ["020_drop.sql", "DROP FUNCTION IF EXISTS f();\nDROP TABLE t;"],
    ["030_again.sql", "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 2 $$;"],
  ]);
  assert.equal(endedBy({ kind: "function", name: "f" }, "010_make.sql", files), null, "re-created by 030");
  assert.equal(endedBy({ kind: "column", name: "c", table: "t" }, "010_make.sql", files), "020_drop.sql", "table dropped");
  assert.equal(endedBy({ kind: "table", name: "t" }, "010_make.sql", files), "020_drop.sql");
  assert.equal(endedBy({ kind: "table", name: "t" }, "020_drop.sql", files), null, "a file's own drop does not count as later");
});

function fixture() {
  const files = new Map([
    ["100_out.sql", "/* status: APPLIED OUTSIDE LEDGER */\nCREATE TABLE IF NOT EXISTS public.widgets (id int);\nCREATE INDEX idx_w ON widgets (id);\nCREATE POLICY w_read ON widgets FOR SELECT USING (true);\nALTER TABLE widgets ADD COLUMN IF NOT EXISTS note text;\nCREATE FUNCTION public.w_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;\n"],
    ["300_later.sql", "SELECT 1;\n"],
  ]);
  const entries = [{ file: "100_out.sql", class: "outside-ledger" }];
  const catalog = emptyCatalog();
  catalog.tables.add("widgets");
  catalog.indexes.add("idx_w");
  catalog.policies.add("widgets.w_read");
  catalog.columns.add("widgets.note");
  catalog.functions.add("w_fn");
  return { files, entries, catalog };
}

test("GREEN: every object live -> OBJECTS_VERIFIED, no failure", () => {
  const r = verifyOutsideLedger(fixture());
  assert.deepEqual(r.failures, []);
  assert.ok(r.findings.some((f) => f.startsWith("OBJECTS_VERIFIED 100_out.sql: 5 live")));
});

for (const [label, drop] of [
  ["table", (c) => c.tables.delete("widgets")],
  ["index", (c) => c.indexes.delete("idx_w")],
  ["policy", (c) => c.policies.delete("widgets.w_read")],
  ["column", (c) => c.columns.delete("widgets.note")],
  ["function", (c) => c.functions.delete("w_fn")],
]) {
  test(`ATTACK OUTSIDE_OBJECT_MISSING: the live catalog lacks the file's ${label}`, () => {
    const f = fixture();
    drop(f.catalog);
    const r = verifyOutsideLedger(f);
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].code, "OUTSIDE_OBJECT_MISSING");
    assert.equal(r.failures[0].key, "100_out.sql");
    assert.match(r.failures[0].detail, /never-applied/);
    assert.ok(!r.findings.some((x) => x.startsWith("OBJECTS_VERIFIED")), "a file with a missing object is never verified");
  });
}

test("an object a later file dropped is not expected live; a file whose every object was dropped is UNVERIFIABLE, never verified", () => {
  const f = fixture();
  f.files.set("300_later.sql", "DROP TABLE widgets;\nDROP FUNCTION w_fn();\n");
  for (const k of Object.keys(f.catalog)) f.catalog[k].clear();
  const r = verifyOutsideLedger(f);
  assert.deepEqual(r.failures, []);
  assert.ok(r.findings.some((x) => x.startsWith("OBJECTS_UNVERIFIABLE 100_out.sql")));
  assert.ok(!r.findings.some((x) => x.startsWith("OBJECTS_VERIFIED")));
});

test("a file creating nothing a catalog can name reports NO_CHECKABLE_OBJECTS, never a pass", () => {
  const f = fixture();
  f.files.set("100_out.sql", "DO $$ BEGIN PERFORM 1; END $$;\n");
  const r = verifyOutsideLedger(f);
  assert.deepEqual(r.failures, []);
  assert.ok(r.findings.some((x) => x.startsWith("NO_CHECKABLE_OBJECTS 100_out.sql")));
});

test("only outside-ledger entries are verified", () => {
  const f = fixture();
  f.entries[0].class = "duplicate-prefix";
  f.catalog.tables.clear();
  const r = verifyOutsideLedger(f);
  assert.deepEqual(r, { failures: [], findings: [] });
});

test("catalogFromRows folds the CATALOG_SQL row shape; liveCatalog issues the one read-only query", async () => {
  const cat = catalogFromRows([
    { kind: "table", a: "Widgets", b: null }, { kind: "policy", a: "widgets", b: "W_Read" }, { kind: "column", a: "widgets", b: "note" },
    { kind: "constraint", a: "widgets", b: "k" }, { kind: "index", a: "idx_w", b: "widgets" }, { kind: "function", a: "w_fn", b: null }, { kind: "view", a: "v", b: null },
  ]);
  assert.ok(cat.tables.has("widgets") && cat.policies.has("widgets.w_read") && cat.columns.has("widgets.note") && cat.constraints.has("widgets.k") && cat.indexes.has("idx_w") && cat.functions.has("w_fn") && cat.views.has("v"));
  const seen = [];
  const live = await liveCatalog({ query: async (sql) => { seen.push(sql); return { rows: [{ kind: "table", a: "t", b: null }] }; } });
  assert.deepEqual(seen, [CATALOG_SQL]);
  assert.ok(live.tables.has("t"));
  assert.doesNotMatch(CATALOG_SQL, /\b(insert|update|delete|drop|alter|create|truncate)\b/i, "the catalog query is read-only");
});

// ---- the real tree ----
function realTree() {
  const files = new Map(readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((f) => [f, readFileSync(`${MIG_DIR}/${f}`, "utf8").replace(/\r\n/g, "\n")]));
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  const entries = fileEntries(map).filter((e) => e.class === "outside-ledger");
  // A catalog replayed from the tree: every object any file creates and no later file ends.
  const catalog = emptyCatalog();
  for (const [file, text] of files) {
    for (const o of extractObjects(text)) {
      if (endedBy(o, file, files)) continue;
      if (o.kind === "table") catalog.tables.add(o.name);
      else if (o.kind === "view") catalog.views.add(o.name);
      else if (o.kind === "function") catalog.functions.add(o.name);
      else if (o.kind === "index") catalog.indexes.add(o.name);
      else if (o.kind === "policy") catalog.policies.add(`${o.table}.${o.name}`);
      else if (o.kind === "column") catalog.columns.add(`${o.table}.${o.name}`);
      else if (o.kind === "constraint") catalog.constraints.add(`${o.table}.${o.name}`);
    }
  }
  return { files, entries, catalog };
}

test("REAL TREE: the outside-ledger files verify against a catalog replayed from the tree; 262 and 007_rls_community are reported, never passed", () => {
  const t = realTree();
  assert.ok(t.entries.length >= 10, `expected the ten outside-ledger files, got ${t.entries.length}`);
  const r = verifyOutsideLedger(t);
  assert.deepEqual(r.failures, []);
  const byFile = (name) => r.findings.find((f) => f.includes(` ${name}:`));
  for (const name of ["202_standard_own_body_floor.sql", "205_funded_pass_runlock.sql", "206_mint_gate_hold_marker.sql", "260_fk_indexes_and_scanner_hygiene.sql", "263_mode_vocabulary_ocean_canonical.sql", "315_workspace_due_next.sql", "006_rls_multi_tenant.sql", "007_full_brief.sql"]) {
    assert.match(byFile(name) ?? "", /^OBJECTS_VERIFIED/, name);
  }
  assert.match(byFile("262_rls_initplan_sweep.sql"), /^NO_CHECKABLE_OBJECTS/);
  assert.match(byFile("007_rls_community.sql"), /^OBJECTS_UNVERIFIABLE/);
});

test("REAL TREE ATTACK: 315's function missing from the live catalog is the one named failure", () => {
  const t = realTree();
  assert.ok(t.catalog.functions.delete("get_workspace_due_next"));
  const r = verifyOutsideLedger(t);
  assert.deepEqual(r.failures.map((f) => `${f.code} ${f.key}`), ["OUTSIDE_OBJECT_MISSING 315_workspace_due_next.sql"]);
});

test("REAL TREE ATTACK: one of 260's eight indexes missing, and 206's column missing, are each named", () => {
  const t = realTree();
  t.catalog.indexes.delete("idx_user_item_state_item_id");
  t.catalog.columns.delete("section_claim_provenance.mint_hold_reason");
  const keys = verifyOutsideLedger(t).failures.map((f) => f.key).sort();
  assert.deepEqual(keys, ["206_mint_gate_hold_marker.sql", "260_fk_indexes_and_scanner_hygiene.sql"]);
});
