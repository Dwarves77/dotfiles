// Selftests for the schema-drift pure core (trip + pass). No DB, no fs — the runner supplies live objects
// and migration text; this proves the diff logic and the extractor.
// Run: node --test fsi-app/scripts/verify/lib/schema-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCreatedObjects, committedObjectNames, diffSchema, staleAllowlistEntries } from "./schema-drift.mjs";

test("extractCreatedObjects: tables + views, IF NOT EXISTS / OR REPLACE / MATERIALIZED / public. / quotes", () => {
  const sql = [
    "CREATE TABLE census_worklist (id uuid);",
    "CREATE TABLE IF NOT EXISTS public.coverage_gap_census_findings (id uuid);",
    'CREATE UNLOGGED TABLE "raw_fetches" (id uuid);',
    "CREATE OR REPLACE VIEW census_rollup_by_surface AS SELECT 1;",
    "CREATE MATERIALIZED VIEW public.some_matview AS SELECT 1;",
    "-- a comment mentioning CREATE TABLE not_a_real_one is still matched by regex (acceptable: over-inclusion on the COMMITTED side only widens what counts as sourced, never hides live drift)",
  ].join("\n");
  const got = extractCreatedObjects(sql);
  assert.ok(got.has("census_worklist"));
  assert.ok(got.has("coverage_gap_census_findings"));
  assert.ok(got.has("raw_fetches"));
  assert.ok(got.has("census_rollup_by_surface"));
  assert.ok(got.has("some_matview"));
});

test("extractCreatedObjects: does NOT match ALTER TABLE / CREATE INDEX / CREATE TRIGGER / CREATE FUNCTION", () => {
  const sql = [
    "ALTER TABLE sources ADD COLUMN base_tier int;",
    "CREATE INDEX idx_foo ON sources (url);",
    "CREATE TRIGGER trg BEFORE INSERT ON sources EXECUTE FUNCTION f();",
    "CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;",
  ].join("\n");
  const got = extractCreatedObjects(sql);
  assert.equal(got.size, 0, "only CREATE TABLE / CREATE VIEW define new information_schema objects");
});

test("committedObjectNames: folds the union across migrations", () => {
  const committed = committedObjectNames([
    "CREATE TABLE a (id int);",
    "CREATE TABLE b (id int);\nCREATE VIEW c AS SELECT 1;",
  ]);
  assert.deepEqual([...committed].sort(), ["a", "b", "c"]);
});

test("diffSchema: TRIP — a live object with no committed CREATE is drift (the census-burn shape)", () => {
  const drift = diffSchema({
    liveObjects: [{ name: "sources", kind: "table" }, { name: "census_worklist", kind: "table" }],
    committed: new Set(["sources"]), // census_worklist live but uncommitted — the exact 2026-07-19 burn
  });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].name, "census_worklist");
  assert.match(drift[0].reason, /no committed CREATE/);
});

test("diffSchema: PASS — every live object traces to a committed CREATE", () => {
  const drift = diffSchema({
    liveObjects: [{ name: "sources", kind: "table" }, { name: "Census_Worklist", kind: "table" }],
    committed: new Set(["sources", "census_worklist"]), // case-insensitive match
  });
  assert.deepEqual(drift, []);
});

test("diffSchema: a reasoned allowlist entry suppresses that object's drift", () => {
  const drift = diffSchema({
    liveObjects: [{ name: "acquisition_backlog_v", kind: "view" }],
    committed: new Set(),
    allowlist: { acquisition_backlog_v: "pre-existing drift, routed to B" },
  });
  assert.deepEqual(drift, []);
});

test("staleAllowlistEntries: flags an allowlisted object that is gone OR now committed", () => {
  const stale = staleAllowlistEntries({
    liveNames: new Set(["still_live_uncommitted", "now_committed"]),
    committed: new Set(["now_committed"]),
    allowlist: {
      still_live_uncommitted: "legit exemption",       // stays: live + uncommitted
      now_committed: "was drift, migration since landed", // stale: now has a committed source
      long_gone: "object dropped",                       // stale: no longer live
    },
  });
  const names = stale.map((s) => s.name).sort();
  assert.deepEqual(names, ["long_gone", "now_committed"]);
});
