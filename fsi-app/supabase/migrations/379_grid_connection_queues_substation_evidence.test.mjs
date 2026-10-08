// 379_grid_connection_queues_substation_evidence.test.mjs -- static proof of migration 379 (lane S8-E6) by parsing the
// SQL: no database. The ATTACKS (figure without its envelope, unknown constraint, no band and no substation, duplicate
// key) run in the migration's own self-check at apply time inside a rolled-back sub-transaction and in the PR's
// migration-proof job; this file proves the SQL carries them, that its vocabularies equal the code's, that its trigger
// has migration 352's form, and that every fixture INSERT in the self-check supplies what the creating migrations
// require.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGIN_CLASSES } from "../../src/lib/contracts/vocabularies.mjs";
import { DERIVATIONS } from "../../src/lib/contracts/envelope.mjs";
import { CONSTRAINTS } from "../../scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs";
import { TABLE_PRIMARY_KEY } from "../../scripts/lib/table-primary-keys.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "379_grid_connection_queues_substation_evidence.sql"), "utf8");
const strip = (t) => t.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SQL = strip(RAW);
const M297 = strip(readFileSync(join(HERE, "297_spec09_operations_tables.sql"), "utf8"));
const M296 = strip(readFileSync(join(HERE, "296_spec09_market_tables.sql"), "utf8"));
const M352 = strip(readFileSync(join(HERE, "352_outbox_entity_for_emission_factors.sql"), "utf8"));

/** Columns of grid_connection_queues as migration 297 creates them: name -> { notNull, hasDefault }. */
function table297() {
  const start = M297.indexOf("CREATE TABLE IF NOT EXISTS public.grid_connection_queues (");
  const body = M297.slice(start, M297.indexOf(");", M297.indexOf("CONSTRAINT grid_connection_queues_percentiles_ordered")));
  const cols = new Map();
  for (const line of body.split("\n").slice(1)) {
    const m = /^\s{2}([a-z_0-9]+)\s+(uuid|text|numeric|date|timestamptz)\b(.*)$/.exec(line);
    if (m) cols.set(m[1], { notNull: /NOT NULL|PRIMARY KEY/.test(m[3]), hasDefault: /DEFAULT/.test(m[3]) });
  }
  return cols;
}
const BASE = table297();
const ADDED = [...SQL.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+) /g)].map((m) => m[1]);

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 379 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("migration 297's grid_connection_queues is read as expected (9 columns, band NOT NULL, PK queue_id)", () => {
  assert.equal(BASE.size, 9);
  assert.equal(BASE.get("capacity_band_mw").notNull, true);
  assert.equal(TABLE_PRIMARY_KEY.grid_connection_queues, "queue_id");
  assert.ok(BASE.has("jurisdiction_id"));
});

test("ten nullable columns are added, none NOT NULL, and the self-check expects 9 + 10 columns", () => {
  assert.deepEqual(ADDED, [
    "substation_ref", "substation_name", "demand_firm_mw", "demand_available_mw", "demand_constraint",
    "demand_constraint_limiting_factor", "source_id", "origin_class", "derivation", "confidence_admiralty",
  ]);
  for (const c of ADDED) assert.ok(!BASE.has(c), `${c} is new`);
  const addBlock = SQL.slice(SQL.indexOf("ALTER TABLE public.grid_connection_queues\n  ADD COLUMN"), SQL.indexOf("COMMENT ON COLUMN public.grid_connection_queues.substation_ref"));
  assert.doesNotMatch(addBlock, /NOT NULL/);
  assert.match(addBlock, /source_id uuid REFERENCES public\.sources\(id\)/);
  assert.match(SQL, /IF n_cols <> 19 THEN/);
  assert.equal(BASE.size + ADDED.length, 19);
});

test("capacity_band_mw is relaxed to nullable, and a CHECK keeps 'a band or a substation'", () => {
  assert.match(SQL, /ALTER COLUMN capacity_band_mw DROP NOT NULL;/);
  assert.match(SQL, /grid_connection_queues_band_or_substation\s+CHECK \(capacity_band_mw IS NOT NULL OR substation_ref IS NOT NULL\)/);
});

test("a demand figure requires its envelope; demand_available_mw has no lower bound (a deficit is a fact)", () => {
  assert.match(SQL, /grid_connection_queues_demand_figure_enveloped[\s\S]*?\(demand_firm_mw IS NULL AND demand_available_mw IS NULL\)\s+OR \(source_id IS NOT NULL AND origin_class IS NOT NULL AND derivation IS NOT NULL\)/);
  assert.match(SQL, /demand_firm_mw IS NULL OR demand_firm_mw >= 0/);
  assert.doesNotMatch(SQL, /demand_available_mw >= 0/);
});

function list(sql, column) {
  const re = new RegExp(`(?<!\\w)${column}\\s+IN\\s*\\(([^)]*)\\)`, "g");
  return [...sql.matchAll(re)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
}

test("vocabularies: origin_class and derivation lists equal the code's and migration 296's, byte for byte, in order", () => {
  const o = list(SQL, "origin_class").find((l) => l.length > 3);
  const d = list(SQL, "derivation").find((l) => l.length > 3);
  assert.deepEqual(o, [...ORIGIN_CLASSES]);
  assert.deepEqual(d, [...DERIVATIONS]);
  assert.deepEqual(o, list(M296, "origin_class")[0]);
  assert.deepEqual(d, list(M296, "derivation")[0]);
});

test("the constraint list equals the producer's RAG set", () => {
  assert.deepEqual(list(SQL, "demand_constraint")[0], [...CONSTRAINTS]);
});

test("Admiralty shape guard equals migration 296's", () => {
  assert.match(SQL, /confidence_admiralty ~ '\^\[A-F\]\[1-6\]\$'/);
  assert.match(M296, /confidence_admiralty ~ '\^\[A-F\]\[1-6\]\$'/);
});

test("unique key (dso_name, substation_ref, as_of); every constraint is added behind an existence guard", () => {
  assert.match(SQL, /UNIQUE \(dso_name, substation_ref, as_of\)/);
  const adds = [...SQL.matchAll(/ADD CONSTRAINT ([a-z_]+)/g)].map((m) => m[1]);
  assert.equal(adds.length, 8);
  for (const n of adds) assert.match(SQL, new RegExp(`conname = '${n}'`), `${n} is guarded`);
});

test("outbox trigger is migration 352's form: same event, pk column queue_id, entity column jurisdiction_id (2 arguments)", () => {
  const re = /CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.([a-z_]+)\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\(([^)]*)\)/;
  const mine = re.exec(SQL);
  const theirs = re.exec(M352);
  assert.equal(mine[1], "grid_connection_queues");
  assert.equal(mine[2], "'queue_id', 'jurisdiction_id'");
  assert.equal(theirs[2].split(",").length, 2, "352 attaches with two arguments");
  assert.match(SQL, /DROP TRIGGER IF EXISTS propagation_outbox_trg ON public\.grid_connection_queues;/);
  assert.ok(BASE.has("queue_id") && BASE.has("jurisdiction_id"));
  assert.match(SQL, /prosrc LIKE '%TG_ARGV\[1\]%'/, "precondition: 352's entity argument exists");
});

test("self-check attacks: figure without envelope, unknown constraint, no band and no substation, duplicate key; sentinel rollback; nothing survives", () => {
  for (const frag of [
    "a demand MW figure without its envelope was accepted",
    "an unknown demand_constraint was accepted",
    "a row with neither a band nor a substation was accepted",
    "a duplicate (dso_name, substation_ref, as_of) was accepted",
    "did not name the jurisdiction",
    "m379_selfcheck_rollback",
    "left % propagation_events row(s) behind",
    "left % grid_connection_queues row(s) behind",
    "left its fixture entity behind",
  ]) assert.ok(SQL.includes(frag), frag);
  assert.match(SQL, /EXCEPTION WHEN check_violation THEN/);
  assert.match(SQL, /EXCEPTION WHEN unique_violation THEN/);
  assert.match(SQL, /-3\.1/, "the leg that accepts a deficit");
});

test("every fixture INSERT in the self-check supplies the NOT NULL, default-less columns of the creating migrations and names only real columns", () => {
  const known = new Set([...BASE.keys(), ...ADDED]);
  // 297 NOT NULL without default, minus the one column 379 relaxes
  const required = [...BASE].filter(([n, v]) => v.notNull && !v.hasDefault && n !== "queue_id" && n !== "capacity_band_mw").map(([n]) => n);
  assert.deepEqual(required.sort(), ["as_of", "dso_name", "jurisdiction_id"]);
  const inserts = [...SQL.matchAll(/INSERT INTO public\.grid_connection_queues\s*\(([^)]*)\)/g)];
  assert.ok(inserts.length >= 6);
  for (const m of inserts) {
    const cols = m[1].split(",").map((c) => c.trim());
    for (const c of cols) assert.ok(known.has(c), `unknown column ${c}`);
    for (const r of required) assert.ok(cols.includes(r), `insert lacks required ${r}: (${cols.join(", ")})`);
  }
  // the entities fixture is the one migration 297's own post-check uses
  const ent = /INSERT INTO public\.entities \(([^)]*)\)/.exec(SQL)[1];
  assert.equal(ent.replace(/\s/g, ""), "entity_id,kind,canonical_name");
  assert.match(M297, /INSERT INTO public\.entities \(entity_id, kind, canonical_name\)/);
  // the fixture entity id has the shape the entities CHECK requires: cl:<kind>:<16 hex>
  const id = /ok_jur\s+text := '([^']+)'/.exec(SQL)[1];
  assert.match(id, /^cl:jurisdiction:[0-9a-f]{16}$/);
});

test("no dash glyph, no section sign, no home path in the migration (rules 022, 012)", () => {
  assert.ok(!/[\u2013\u2014\u00a7]/.test(RAW));
  assert.ok(!/(Users[\\/]|\/home\/)/.test(RAW));
});

test("preconditions name the migrations this one depends on", () => {
  for (const frag of ["migration 297", "migration 282", "migration 284", "migration 352"]) assert.ok(RAW.includes(frag), frag);
});
