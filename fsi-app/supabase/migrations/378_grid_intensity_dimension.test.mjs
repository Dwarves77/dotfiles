// 378_grid_intensity_dimension.test.mjs -- static proof of migration 378 (lane S8-E5), by parsing the SQL file and the
// migrations it extends: no database, no SQL parser dependency. The behavioural proof is the migration's own self-check
// (a rolled-back fact insert on the new dimension plus two refused bogus dimensions), which runs at apply time; this file
// proves the file says what the lane's report says it says, and that its fixtures satisfy the tables' definitions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql, columnLists } from "./_lib/fixture-inserts.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "378_grid_intensity_dimension.sql"), "utf8");
const SQL = stripSql(RAW);
const read = (name) => readFileSync(join(HERE, name), "utf8");

const SIX = ["regulatory_feasibility", "regional_resources", "labor_markets", "materials_sourcing", "infrastructure", "operational_cost"];
const SEVEN = [...SIX, "grid_intensity"];

test("header: subject line, states NOT APPLIED, names the ruling and why a new value rather than an existing one", () => {
  assert.match(RAW, /^-- subject: Migration 378 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /ruling A/i);
  assert.match(RAW, /regional_resources/);
  assert.match(RAW, /operational_cost/);
});

test("the six values the migration extends are the ones migrations 106 and 109 created (not a copy that could drift)", () => {
  for (const [file, name] of [["106_regions_and_facts.sql", "regional_data_facts_dimension_check"], ["109_region_dimension_coverage.sql", "region_dimension_coverage_dimension_check"]]) {
    const m = new RegExp(`ADD CONSTRAINT ${name}\\s+CHECK \\(dimension IN \\(([^)]*)\\)\\)`).exec(read(file));
    assert.ok(m, `${file} defines ${name}`);
    assert.deepEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]), SIX);
  }
});

test("both dimension CHECKs are replaced with the six plus grid_intensity: the coverage trigger of 109 upserts the second table on every fact", () => {
  for (const name of ["regional_data_facts_dimension_check", "region_dimension_coverage_dimension_check"]) {
    const table = name.startsWith("regional") ? "regional_data_facts" : "region_dimension_coverage";
    assert.match(SQL, new RegExp(`ALTER TABLE ${table}\\s+DROP CONSTRAINT IF EXISTS ${name};`));
    const m = new RegExp(`ALTER TABLE ${table}\\s+ADD CONSTRAINT ${name}\\s+CHECK \\(dimension IN \\(([^)]*)\\)\\);`).exec(SQL);
    assert.ok(m, `${name} is re-added`);
    assert.deepEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]), SEVEN);
  }
  // The reason both are needed: the 109 trigger writes region_dimension_coverage for the changed fact's dimension.
  assert.match(read("109_region_dimension_coverage.sql"), /INSERT INTO region_dimension_coverage \(region_id, dimension, fact_count, updated_at\)/);
  assert.match(read("109_region_dimension_coverage.sql"), /AFTER INSERT OR UPDATE OR DELETE ON regional_data_facts\s+FOR EACH ROW EXECUTE FUNCTION region_dimension_coverage_sync_fact_count/);
});

test("the schema rebuilt from the tree through 378 carries the seven values on both tables (and only the six before it)", () => {
  const before = buildSchema(HERE, { before: 378 });
  const after = buildSchema(HERE, { before: 379 });
  for (const table of ["regional_data_facts", "region_dimension_coverage"]) {
    const b = columnLists(before, table, "dimension");
    const a = columnLists(after, table, "dimension");
    assert.equal(b.length, 1, `${table}: one dimension list before`);
    assert.equal(a.length, 1, `${table}: one dimension list after`);
    assert.deepEqual([...b[0].values], SIX);
    assert.deepEqual([...a[0].values], SEVEN);
  }
});

test("no other statement widens a vocabulary: no seed into region_dimension_coverage, no other constraint touched", () => {
  // the only insert into the coverage table is the bogus-dimension attack (which must be refused), never a seed
  const covInserts = parseInserts(SQL).filter((i) => i.table === "region_dimension_coverage");
  assert.equal(covInserts.length, 1);
  assert.ok(covInserts[0].rows.every((r) => r.some((l) => l.kind === "string" && l.value === "not_a_dimension")));
  const dropped = [...SQL.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(dropped, ["region_dimension_coverage_dimension_check", "regional_data_facts_dimension_check"]);
  assert.doesNotMatch(SQL, /\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
});

test("data_sources: neso_carbon_intensity is registered as the FK target, permitted and embeddable, ON CONFLICT DO NOTHING, never DO UPDATE", () => {
  const m = /INSERT INTO public\.data_sources\s*\(([^)]*)\)\s*VALUES \(([\s\S]*?)\)\s*ON CONFLICT \(source_key\) DO NOTHING;/.exec(SQL);
  assert.ok(m, "the data_sources insert");
  assert.match(m[2], /'neso_carbon_intensity'/);
  assert.match(m[2], /'permitted',\s*true/);
  assert.match(m[2], /CC BY 4\.0/);
  assert.doesNotMatch(SQL, /ON CONFLICT[^;]*DO UPDATE/i);
  // the columns written exist on the table defined in 258
  const cols = m[1].split(",").map((c) => c.trim());
  const t = buildSchema(HERE, { before: 378 }).tables.get("data_sources");
  for (const c of cols) assert.ok(t.columns.has(c), `data_sources.${c} exists`);
  // regional_data_facts.source_key is the FK the producer's rows depend on (migration 267)
  assert.match(read("267_origin_class_and_envelope.sql"), /ADD COLUMN IF NOT EXISTS source_key text REFERENCES public\.data_sources\(source_key\)/);
});

test("self-check: rolled back by a sentinel, attacks both guards with a bogus dimension, and asserts nothing survives", () => {
  assert.match(SQL, /RAISE EXCEPTION 's8e5_378_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 's8e5_378_selfcheck_rollback' THEN RAISE; END IF/);
  assert.equal((SQL.match(/WHEN check_violation THEN/g) ?? []).length, 2, "one refusal per table");
  for (const phrase of [
    "the coverage trigger did not record the new dimension",
    "regional_data_facts accepted a dimension outside the vocabulary",
    "region_dimension_coverage accepted a dimension outside the vocabulary",
    "left % fact row(s) behind",
    "left a coverage cell behind",
  ]) assert.ok(SQL.includes(phrase), phrase);
});

test("fixtures: every self-check INSERT satisfies the table definitions rebuilt from the tree through 378 (NOT NULL, defaults, CHECK lists)", () => {
  const schema = buildSchema(HERE, { before: 379 });
  const inserts = parseInserts(SQL);
  const updates = parseUpdates(SQL);
  const mine = inserts.filter((i) => i.table !== "data_sources");
  assert.deepEqual([...new Set(mine.map((i) => i.table))].sort(), ["region_dimension_coverage", "regional_data_facts"]);
  const bogus = inserts.filter((i) => i.rows.some((r) => r.some((l) => l.kind === "string" && l.value === "not_a_dimension")));
  assert.equal(bogus.length, 2, "the two attack inserts");
  // the accepted fixtures are clean; the attack inserts are reported (red), which is what makes them attacks
  assert.deepEqual(checkFixtures({ inserts: inserts.filter((i) => !bogus.includes(i)), updates, schema }), []);
  assert.match(checkFixtures({ inserts: bogus, schema }).join("|"), /'not_a_dimension' violates/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
