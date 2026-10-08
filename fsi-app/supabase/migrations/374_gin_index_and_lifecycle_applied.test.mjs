// 374_gin_index_and_lifecycle_applied.test.mjs -- static proof of migration 374 (lane MIG-374) by parsing the SQL
// file: no database, no SQL parser dependency. The self-check runs inside the migration at apply time; this file
// proves the file carries it, and the shapes the readers depend on (inference-view.mjs's containment read and
// prediction-scoring.mjs's lifecycle stamp and repair).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./374_gin_index_and_lifecycle_applied.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line, NOT APPLIED, and the reason the index is not concurrent", () => {
  assert.match(RAW, /^-- subject: Migration 374 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /CREATE INDEX CONCURRENTLY cannot run inside a transaction block/);
  assert.doesNotMatch(SQL, /CONCURRENTLY/i, "the plain form is used");
});

test("the GIN index is on inference_records.cited_item_ids, named, idempotent", () => {
  assert.match(SQL, /CREATE INDEX IF NOT EXISTS inference_records_cited_item_ids_gin_idx ON public\.inference_records USING gin \(cited_item_ids\);/);
});

test("signposts gains one nullable timestamptz column with no default", () => {
  assert.match(SQL, /ALTER TABLE public\.signposts\s+ADD COLUMN IF NOT EXISTS lifecycle_applied_at timestamptz;/);
  assert.doesNotMatch(SQL, /lifecycle_applied_at timestamptz\s+(NOT NULL|DEFAULT)/i);
});

test("the backfill stamps every already fired signpost from fired_at, after the column exists, and writes nothing else", () => {
  const stmts = SQL.match(/UPDATE\s+public\.signposts[\s\S]*?;/gi) ?? [];
  assert.equal(stmts.length, 1, "exactly one UPDATE of signposts");
  assert.match(stmts[0], /^UPDATE public\.signposts SET lifecycle_applied_at = fired_at WHERE fired_at IS NOT NULL AND lifecycle_applied_at IS NULL;$/);
  assert.ok(SQL.indexOf("ADD COLUMN IF NOT EXISTS lifecycle_applied_at") < SQL.indexOf(stmts[0]), "the column is added before it is filled");
  assert.match(SQL, /GET DIAGNOSTICS n_stamped = ROW_COUNT/);
  assert.doesNotMatch(SQL, /DELETE\s+FROM/i);
  assert.doesNotMatch(SQL, /UPDATE\s+public\.(?!signposts\b)/i, "no other table is updated");
});

test("no writer marker is needed: no trigger is attached to signposts by any migration", () => {
  const dir = fileURLToPath(new URL("./", import.meta.url));
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(dir + f, "utf8").split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
    assert.doesNotMatch(sql, /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER[^;]*\bON\s+(public\.)?signposts\b/i, f);
  }
});

test("the column comment names the write that sets it", () => {
  const c = /COMMENT ON COLUMN public\.signposts\.lifecycle_applied_at IS\s+'((?:[^']|'')*)'/.exec(SQL);
  assert.ok(c, "a COMMENT ON COLUMN exists");
  assert.match(c[1], /prediction-scoring\.mjs/);
  assert.match(c[1], /fireSignpost/);
  assert.match(c[1], /research_assessments\.lifecycle_state/);
  assert.match(c[1], /only where still NULL/);
});

test("the self-check requires zero fired signposts with a NULL stamp after the backfill, and the NOTICE reports how many were stamped", () => {
  assert.match(SQL, /SELECT count\(\*\) INTO n_unstamped FROM public\.signposts WHERE fired_at IS NOT NULL AND lifecycle_applied_at IS NULL;/);
  assert.match(SQL, /IF n_unstamped <> 0 THEN/);
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: % fired signpost\(s\) still carry no lifecycle_applied_at/);
  assert.match(SQL, /set_config\('mig374\.stamped', n_stamped::text, true\)/);
  assert.match(SQL, /current_setting\('mig374\.stamped'\)/);
  assert.match(SQL, /RAISE NOTICE 'migration 374 OK:[^;]*stamped/);
});

test("the self-check asserts the index exists as a valid gin index on the column, and the column exists, is timestamptz and nullable", () => {
  assert.match(SQL, /no index named inference_records_cited_item_ids_gin_idx/);
  assert.match(SQL, /expected gin/);
  assert.match(SQL, /IF NOT v_valid THEN/);
  assert.match(SQL, /signposts\.lifecycle_applied_at does not exist/);
  assert.match(SQL, /expected timestamp with time zone/);
  assert.match(SQL, /must be nullable/);
});

test("preconditions abort when the tables or the indexed column are missing", () => {
  assert.match(SQL, /to_regclass\('public\.inference_records'\) IS NULL/);
  assert.match(SQL, /to_regclass\('public\.signposts'\) IS NULL/);
  assert.match(SQL, /column_name = 'cited_item_ids'/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});

test("consumers: the containment read and the stamp exist in code under the names the migration states", () => {
  const read = readFileSync(fileURLToPath(new URL("../../src/lib/detail/inference-view.mjs", import.meta.url)), "utf8");
  assert.match(read, /\.contains\("cited_item_ids"/);
  const scoring = readFileSync(fileURLToPath(new URL("../../src/lib/learning/prediction-scoring.mjs", import.meta.url)), "utf8");
  assert.match(scoring, /lifecycle_applied_at/);
  assert.match(scoring, /markLifecycleApplied/);
});
